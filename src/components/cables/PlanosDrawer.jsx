import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ExternalLink, FileSpreadsheet, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';
import { useProjectArea } from '../../contexts/ProjectAreaContext';

const emptyForm = { id: null, wbs: '', sistema: '', plano: '', revision: '', document_url: '' };
const allowedHost = (hostname) => hostname === '1drv.ms'
  || hostname === 'onedrive.live.com'
  || hostname === 'drive.google.com'
  || hostname === 'docs.google.com'
  || hostname.endsWith('.sharepoint.com');
const validDocumentUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && allowedHost(url.hostname.toLowerCase()); }
  catch { return false; }
};
const norm = (value) => String(value || '').trim();
const isPatPlano = (value) => /^[A-Z0-9]+(?:-[A-Z0-9]+)*-GL-[A-Z0-9]+$/i.test(norm(value));
const hyperlinkFromCell = (cell) => {
  const directTarget = norm(cell?.l?.Target || cell?.l?.target);
  if (directTarget) return directTarget;
  const formula = norm(cell?.f);
  const formulaMatch = formula.match(/^HYPERLINK\(\s*"([^"]+)"/i);
  return formulaMatch?.[1] || '';
};

export default function PlanosDrawer({ open, onClose }) {
  const { activeAreaId, isAdmin } = useProjectArea();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sortField, setSortField] = useState('wbs');
  const [sortDirection, setSortDirection] = useState('asc');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!open || !activeAreaId) return;
    setLoading(true); setMessage('');
    const { data, error } = await supabase.from('project_planos').select('*')
      .eq('project_area_id', activeAreaId).ilike('plano', '%-GL-%').order('wbs').order('plano').order('sistema');
    if (error) setMessage(error.message); else setRows(data || []);
    setLoading(false);
  }, [open, activeAreaId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matching = term ? rows.filter(row => [row.wbs, row.plano, row.revision, row.sistema, row.document_url].some(v => String(v || '').toLowerCase().includes(term))) : rows;
    return [...matching].sort((a, b) => String(a[sortField] || '').localeCompare(String(b[sortField] || ''), 'es', { numeric: true }) * (sortDirection === 'asc' ? 1 : -1));
  }, [rows, search, sortField, sortDirection]);

  const sortBy = (field) => {
    if (sortField === field) setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const save = async (event) => {
    event.preventDefault(); setMessage('');
    const payload = { wbs: norm(form.wbs), sistema: norm(form.sistema), plano: norm(form.plano), revision: norm(form.revision) || null, document_url: norm(form.document_url), project_area_id: activeAreaId };
    if (!payload.wbs || !payload.sistema || !payload.plano || !isPatPlano(payload.plano) || !validDocumentUrl(payload.document_url)) {
      setMessage('Complete los campos, use un código PAT con -GL- y un enlace válido de OneDrive, SharePoint o Google Drive.'); return;
    }
    const query = form.id
      ? supabase.from('project_planos').update({ revision: payload.revision, document_url: payload.document_url }).eq('id', form.id).eq('project_area_id', activeAreaId)
      : supabase.from('project_planos').insert(payload);
    const { error } = await query;
    if (error) setMessage(error.message); else { setEditing(false); setForm(emptyForm); await load(); }
  };

  const remove = async (row) => {
    if (!window.confirm(`¿Eliminar el plano ${row.plano}?`)) return;
    const { error } = await supabase.from('project_planos').delete().eq('id', row.id).eq('project_area_id', activeAreaId);
    if (error) setMessage(error.message); else await load();
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setLoading(true); setMessage('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headers = (matrix[0] || []).map(v => norm(v).toUpperCase());
      const indexes = { wbs: headers.indexOf('WBS'), sistema: headers.findIndex(v => ['TÍTULO', 'TITULO', 'SISTEMA'].includes(v)), plano: headers.indexOf('PLANO'), revision: headers.findIndex(v => ['REV', 'REVISION', 'REVISIÓN'].includes(v)), url: headers.findIndex(v => ['URL', 'ENLACE', 'LINK'].includes(v)) };
      if (indexes.wbs < 0 || indexes.sistema < 0 || indexes.plano < 0 || indexes.revision < 0 || indexes.url < 0) throw new Error('El Excel debe contener WBS, PLANO, REV, TITULO y URL.');
      let imported = 0;
      let missingFields = 0;
      let nonPatCodes = 0;
      let missingUrls = 0;
      const databaseErrors = [];
      const knownRows = new Map(rows.map(item => [`${item.wbs}|${item.sistema}|${item.plano}`.toLowerCase(), item]));
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const values = matrix[rowIndex];
        const planoCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: indexes.plano })];
        const urlCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: indexes.url })];
        const visibleUrlValue = norm(values[indexes.url]);
        const payload = {
          project_area_id: activeAreaId,
          wbs: norm(values[indexes.wbs]), sistema: norm(values[indexes.sistema]), plano: norm(values[indexes.plano]), revision: norm(values[indexes.revision]) || null,
          document_url: validDocumentUrl(visibleUrlValue)
            ? visibleUrlValue
            : hyperlinkFromCell(urlCell) || hyperlinkFromCell(planoCell),
        };
        if (!payload.wbs || !payload.sistema || !payload.plano) { missingFields += 1; continue; }
        if (!isPatPlano(payload.plano)) { nonPatCodes += 1; continue; }
        if (!validDocumentUrl(payload.document_url)) { missingUrls += 1; continue; }
        const businessKey = `${payload.wbs}|${payload.sistema}|${payload.plano}`.toLowerCase();
        const existing = knownRows.get(businessKey);
        const { data: saved, error } = existing
          ? await supabase.from('project_planos').update({ revision: payload.revision, document_url: payload.document_url }).eq('id', existing.id).select().single()
          : await supabase.from('project_planos').insert(payload).select().single();
        if (error) databaseErrors.push(`${payload.plano}: ${error.message}`);
        else { imported += 1; if (saved) knownRows.set(businessKey, saved); }
      }
      await load();
      const rejected = missingFields + nonPatCodes + missingUrls + databaseErrors.length;
      const details = [
        missingFields && `${missingFields} sin WBS/PLANO/TITULO`,
        nonPatCodes && `${nonPatCodes} sin código GL válido`,
        missingUrls && `${missingUrls} sin URL extraíble`,
        databaseErrors.length && `${databaseErrors.length} errores de base de datos (${databaseErrors[0]})`,
      ].filter(Boolean).join(' · ');
      setMessage(`${imported} importados o actualizados${rejected ? ` · ${rejected} rechazados: ${details}` : ''}.`);
    } catch (error) { setMessage(error.message || 'No se pudo importar el archivo.'); }
    finally { setLoading(false); }
  };

  const editorRow = (key = 'new') => (
    <tr key={key} className="planos-inline-editor">
      <td>{form.id ? form.wbs : <input value={form.wbs} onChange={e => setForm({ ...form, wbs: e.target.value })} placeholder="WBS" autoFocus />}</td>
      <td>{form.id ? form.plano : <input value={form.plano} onChange={e => setForm({ ...form, plano: e.target.value })} placeholder="PLANO" />}</td>
      <td><input value={form.revision || ''} onChange={e => setForm({ ...form, revision: e.target.value })} placeholder="REV" /></td>
      <td>{form.id ? form.sistema : <input value={form.sistema} onChange={e => setForm({ ...form, sistema: e.target.value })} placeholder="TITULO" />}</td>
      <td><input value={form.document_url} onChange={e => setForm({ ...form, document_url: e.target.value })} placeholder="https://..." /><div className="planos-inline-actions"><button className="btn btn-primary" onClick={save}>Guardar</button><button className="btn btn-secondary" onClick={() => { setEditing(false); setForm(emptyForm); }}>Cancelar</button></div></td>
    </tr>
  );

  if (!open) return null;
  return (
    <>
      <button className="pat-detail-backdrop" onClick={onClose} aria-label="Cerrar planos" />
      <aside className="pat-detail-drawer planos-drawer" onClick={e => e.stopPropagation()}>
        <header className="pat-detail-drawer-header">
          <div><strong>Planos</strong><span>Documentos de OneDrive, SharePoint y Google Drive</span></div>
          <button className="pat-detail-close" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="planos-toolbar">
          <label><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar WBS, plano, REV o titulo..." /></label>
          <span>{filtered.length} planos</span>
          {isAdmin && <><button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={15} /> Importar Excel</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={importExcel} /><button className="btn btn-primary" onClick={() => { setForm(emptyForm); setEditing(true); }}><Plus size={15} /> Nuevo</button></>}
        </div>
        {message && <div className="message warning planos-message">{message}</div>}
        <div className="planos-table-wrap">
          <table className="planos-table"><thead><tr>
            {[['wbs','WBS'],['plano','PLANO'],['revision','REV'],['sistema','TITULO'],['document_url','URL']].map(([field, label]) => <th key={field}><button className="planos-sort" onClick={() => sortBy(field)}>{label}<ArrowUpDown size={12} className={sortField === field && sortDirection === 'desc' ? 'flipped' : ''} /></button></th>)}
          </tr></thead><tbody>
            {editing && !form.id && editorRow()}
            {loading ? <tr><td colSpan="5">Cargando...</td></tr> : filtered.length === 0 && !(editing && !form.id) ? <tr><td colSpan="5">No hay planos PAT con código GL registrados.</td></tr> : filtered.map(row => editing && form.id === row.id ? editorRow(row.id) : <tr key={row.id}>
              <td>{row.wbs}</td><td>{row.plano}</td><td>{row.revision || '—'}</td><td>{row.sistema}</td><td className="planos-link-cell"><a href={row.document_url} target="_blank" rel="noopener noreferrer">Abrir plano<ExternalLink size={13} /></a>{isAdmin && <span><button onClick={() => { setForm(row); setEditing(true); }} title="Editar"><Pencil size={13} /></button><button onClick={() => remove(row)} title="Eliminar"><Trash2 size={13} /></button></span>}</td>
            </tr>)}</tbody></table>
        </div>
      </aside>
    </>
  );
}
