import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, CheckSquare, Download, ExternalLink, FileSpreadsheet, LoaderCircle, Pencil, Plus, Search, Square, Trash2, X, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';
import { useProjectArea } from '../../contexts/ProjectAreaContext';

const PAT_PARTITION = 'PUESTA A TIERRA';
const emptyForm = { id: null, partition: PAT_PARTITION, wbs: '', sistema: '', plano: '', revision: '', document_url: '' };
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
  const [importing, setImporting] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [sortField, setSortField] = useState('wbs');
  const [sortDirection, setSortDirection] = useState('asc');
  const fileRef = useRef(null);

  // Deletion modals state
  const [deletePlanoTarget, setDeletePlanoTarget] = useState(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    if (!open || !activeAreaId) return;
    setLoading(true); setMessage('');
    const { data, error } = await supabase.from('project_planos').select('*, project_plano_groups(id, folder_url)')
      .eq('project_area_id', activeAreaId).eq('partition', PAT_PARTITION).order('wbs').order('plano').order('sistema');
    if (error) setMessage(error.message); else setRows((data || []).map(row => ({
      ...row,
      group_id: row.group_id || row.project_plano_groups?.id || null,
      document_url: row.project_plano_groups?.folder_url ?? row.document_url ?? '',
    })));
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
  const groupedRows = useMemo(() => {
    const groups = new Map();
    filtered.forEach(row => {
      const key = String(row.wbs || '').toLowerCase();
      if (!groups.has(key)) groups.set(key, { id: row.group_id, wbs: row.wbs, url: row.document_url, rows: [] });
      groups.get(key).rows.push(row);
    });
    return [...groups.values()];
  }, [filtered]);

  const sortBy = (field) => {
    if (sortField === field) setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const save = async (event) => {
    event.preventDefault(); setMessage('');
    const payload = { wbs: norm(form.wbs), sistema: norm(form.sistema), plano: norm(form.plano), revision: norm(form.revision) || null, document_url: norm(form.document_url), project_area_id: activeAreaId, partition: norm(form.partition).toUpperCase() };
    if (payload.partition !== PAT_PARTITION || !payload.wbs || !payload.sistema || !payload.plano || (!form.id && payload.document_url && !validDocumentUrl(payload.document_url))) {
      setMessage('Use la partición PUESTA A TIERRA, complete los campos y, si añade una URL, use un enlace válido de OneDrive, SharePoint o Google Drive.'); return;
    }
    let error;
    if (form.id) {
      ({ error } = await supabase.from('project_planos').update({ revision: payload.revision, sistema: payload.sistema }).eq('id', form.id).eq('project_area_id', activeAreaId));
    } else {
      let { data: group, error: groupError } = await supabase.from('project_plano_groups').select('*')
        .eq('project_area_id', activeAreaId).eq('partition', payload.partition).ilike('wbs', payload.wbs).maybeSingle();
      if (!groupError && group && (group.folder_url || '') !== payload.document_url) groupError = new Error(`El WBS ${payload.wbs} ya tiene una URL diferente.`);
      if (!group && !groupError) ({ data: group, error: groupError } = await supabase.from('project_plano_groups').insert({ project_area_id: activeAreaId, partition: payload.partition, wbs: payload.wbs, folder_url: payload.document_url || null }).select().single());
      error = groupError;
      if (!error) ({ error } = await supabase.from('project_planos').insert({ ...payload, group_id: group.id, document_url: null }));
    }
    if (error) setMessage(error.message); else { setEditing(false); setForm(emptyForm); await load(); }
  };

  const remove = (row) => {
    setDeletePlanoTarget(row);
    setDeleteConfirmation('');
  };

  const handleConfirmDeletePlano = async () => {
    if (!deletePlanoTarget) return;
    setDeleteLoading(true);
    const { error } = await supabase.from('project_planos').delete().eq('id', deletePlanoTarget.id).eq('project_area_id', activeAreaId);
    if (error) setMessage(error.message);
    setDeletePlanoTarget(null);
    await load();
    setDeleteLoading(false);
  };

  const saveGroupUrl = async (group) => {
    const url = norm(editingGroup?.url);
    if (url && !validDocumentUrl(url)) { setMessage('Use una URL válida de OneDrive, SharePoint o Google Drive.'); return; }
    const { error } = await supabase.from('project_plano_groups').update({ folder_url: url || null }).eq('id', group.id).eq('project_area_id', activeAreaId);
    if (error) setMessage(error.message); else { setEditingGroup(null); await load(); }
  };

  const toggleGroup = (groupId) => setSelectedGroups(current => {
    const next = new Set(current);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    return next;
  });

  const removeGroup = (group) => {
    setDeleteGroupTarget(group);
    setDeleteConfirmation('');
  };

  const handleConfirmDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    setDeleteLoading(true);
    const { error } = await supabase.rpc('delete_project_plano_group', { p_group_id: deleteGroupTarget.id });
    if (error) setMessage(error.message);
    setSelectedGroups(current => { const next = new Set(current); next.delete(deleteGroupTarget.id); return next; });
    setDeleteGroupTarget(null);
    await load();
    setDeleteLoading(false);
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setImporting(true); setMessage('Validando archivo e importando planos...');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headers = (matrix[0] || []).map(v => norm(v).toUpperCase());
      const indexes = { partition: headers.findIndex(v => ['PARTICION', 'PARTICIÓN', 'PARTITION'].includes(v)), wbs: headers.indexOf('WBS'), sistema: headers.findIndex(v => ['TÍTULO', 'TITULO', 'SISTEMA'].includes(v)), plano: headers.indexOf('PLANO'), revision: headers.findIndex(v => ['REV', 'REVISION', 'REVISIÓN'].includes(v)), url: headers.findIndex(v => ['URL', 'ENLACE', 'LINK'].includes(v)) };
      if (indexes.partition < 0 || indexes.wbs < 0 || indexes.sistema < 0 || indexes.plano < 0 || indexes.revision < 0 || indexes.url < 0) throw new Error('El Excel debe contener PARTICION, WBS, PLANO, REV, TITULO y URL.');
      let imported = 0;
      let missingFields = 0;
      let wrongPartition = 0;
      const databaseErrors = [];
      const knownRows = new Map(rows.map(item => [`${item.wbs}|${item.plano}`.toLowerCase(), item]));
      const knownGroups = new Map(rows.filter(item => item.group_id).map(item => [`${item.partition}|${item.wbs}`.toLowerCase(), { id: item.group_id, folder_url: item.document_url }]));
      const parsedRows = [];
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const values = matrix[rowIndex];
        const planoCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: indexes.plano })];
        const urlCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: indexes.url })];
        const visibleUrlValue = norm(values[indexes.url]);
        const linkedUrlValue = hyperlinkFromCell(urlCell) || hyperlinkFromCell(planoCell);
        const payload = {
          project_area_id: activeAreaId,
          partition: norm(values[indexes.partition]).toUpperCase(),
          wbs: norm(values[indexes.wbs]), sistema: norm(values[indexes.sistema]), plano: norm(values[indexes.plano]), revision: norm(values[indexes.revision]) || null,
          document_url: validDocumentUrl(visibleUrlValue)
            ? visibleUrlValue
            : linkedUrlValue,
        };
        if (payload.partition !== PAT_PARTITION) { wrongPartition += 1; continue; }
        if (!payload.wbs || !payload.sistema || !payload.plano) { missingFields += 1; continue; }
        if ((visibleUrlValue || linkedUrlValue) && !validDocumentUrl(payload.document_url)) { throw new Error(`La fila ${rowIndex + 1} contiene una URL no válida.`); }
        parsedRows.push(payload);
      }
      const urlsByGroup = new Map();
      parsedRows.forEach(payload => {
        const groupKey = `${payload.partition}|${payload.wbs}`.toLowerCase();
        if (!urlsByGroup.has(groupKey)) urlsByGroup.set(groupKey, { wbs: payload.wbs, urls: new Set() });
        if (payload.document_url) {
          urlsByGroup.get(groupKey).urls.add(payload.document_url);
        }
      });
      const conflictingWbs = [...urlsByGroup.entries()].filter(([key, group]) => {
        if (group.urls.size > 1) return true;
        const dbGroup = knownGroups.get(key);
        if (dbGroup && dbGroup.folder_url && group.urls.size === 1 && !group.urls.has(dbGroup.folder_url)) {
          return true;
        }
        return false;
      }).map(([, group]) => group.wbs);
      const rejectedBeforeImport = missingFields + wrongPartition;
      if (rejectedBeforeImport || conflictingWbs.length) {
        const reasons = [
          missingFields && `${missingFields} sin WBS/PLANO/TITULO`,
          wrongPartition && `${wrongPartition} fuera de la partición PUESTA A TIERRA`,
          conflictingWbs.length && `URLs diferentes para WBS: ${conflictingWbs.join(', ')}`,
        ].filter(Boolean).join(' · ');
        throw new Error(`No se importó ninguna fila. Corrija el archivo: ${reasons}.`);
      }
      for (const payload of parsedRows) {
        const businessKey = `${payload.wbs}|${payload.plano}`.toLowerCase();
        const groupKey = `${payload.partition}|${payload.wbs}`.toLowerCase();
        const existing = knownRows.get(businessKey);
        let group = knownGroups.get(groupKey);
        let error;
        if (group && payload.document_url && group.folder_url && group.folder_url !== payload.document_url) {
          error = new Error(`El WBS ${payload.wbs} contiene URLs diferentes.`);
        }
        if (group && !group.folder_url && payload.document_url && !error) {
          const result = await supabase.from('project_plano_groups').update({ folder_url: payload.document_url }).eq('id', group.id).select().single();
          group = result.data; error = result.error;
          if (group) knownGroups.set(groupKey, group);
        }
        if (!group && !error) {
          const result = await supabase.from('project_plano_groups').insert({ project_area_id: activeAreaId, partition: payload.partition, wbs: payload.wbs, folder_url: payload.document_url || null }).select().single();
          group = result.data; error = result.error;
          if (group) knownGroups.set(groupKey, group);
        }
        let saved;
        if (!error) {
          const result = existing
            ? await supabase.from('project_planos').update({ revision: payload.revision, sistema: payload.sistema, group_id: group.id, document_url: null }).eq('id', existing.id).select().single()
            : await supabase.from('project_planos').insert({ ...payload, group_id: group.id, document_url: null }).select().single();
          saved = result.data; error = result.error;
        }
        if (error) databaseErrors.push(`${payload.plano}: ${error.message}`);
        else { imported += 1; if (saved) knownRows.set(businessKey, saved); }
      }
      await load();
      const rejected = databaseErrors.length;
      const details = [
        databaseErrors.length && `${databaseErrors.length} errores de base de datos (${databaseErrors[0]})`,
      ].filter(Boolean).join(' · ');
      setMessage(`${imported} importados o actualizados${rejected ? ` · ${rejected} rechazados: ${details}` : ''}.`);
    } catch (error) { setMessage(error.message || 'No se pudo importar el archivo.'); }
    finally { setImporting(false); }
  };

  const editorRow = (key = 'new') => (
    <React.Fragment key={key}>
    {!form.id && <tr className="planos-inline-partition"><td colSpan="5"><label>PARTICION<input value={form.partition} onChange={e => setForm({ ...form, partition: e.target.value })} placeholder="PUESTA A TIERRA" /></label></td></tr>}
    <tr className="planos-inline-editor">
      <td>{form.id ? form.wbs : <input value={form.wbs} onChange={e => setForm({ ...form, wbs: e.target.value })} placeholder="WBS" autoFocus />}</td>
      <td>{form.id ? form.plano : <input value={form.plano} onChange={e => setForm({ ...form, plano: e.target.value })} placeholder="PLANO" />}</td>
      <td><input value={form.revision || ''} onChange={e => setForm({ ...form, revision: e.target.value })} placeholder="REV" /></td>
      <td><input value={form.sistema} onChange={e => setForm({ ...form, sistema: e.target.value })} placeholder="TITULO" /></td>
      <td>{!form.id && <input value={form.document_url} onChange={e => setForm({ ...form, document_url: e.target.value })} placeholder="https://..." />}<div className="planos-inline-actions"><button className="btn btn-primary" onClick={save}>Guardar</button><button className="btn btn-secondary" onClick={() => { setEditing(false); setForm(emptyForm); }}>Cancelar</button></div></td>
    </tr>
    </React.Fragment>
  );

  const handleDrawerClick = (e) => {
    const isEditRow = e.target.closest('.planos-inline-editor') || e.target.closest('.planos-inline-partition');
    const isWbsRow = e.target.closest('.planos-wbs-row');
    const isButton = e.target.closest('button') || e.target.closest('a');
    const isInput = e.target.closest('input');
    const isActionCell = e.target.closest('.planos-link-cell');

    if (!isEditRow && !isWbsRow && !isButton && !isInput && !isActionCell) {
      setEditing(false);
      setForm(emptyForm);
      setEditingGroup(null);
      setSelectedGroups(new Set());
    }
  };

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setForm(emptyForm);
      setEditingGroup(null);
      setSelectedGroups(new Set());
    }
  }, [open]);

  if (!open) return null;
  return (
    <>
      <button className="pat-detail-backdrop" onClick={onClose} aria-label="Cerrar planos" />
      <aside className="pat-detail-drawer planos-drawer" onClick={(e) => { e.stopPropagation(); handleDrawerClick(e); }}>
        <header className="pat-detail-drawer-header">
          <div><strong>Planos</strong><span>Documentos de OneDrive, SharePoint y Google Drive</span></div>
          <button className="pat-detail-close" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="planos-toolbar">
          <label><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar WBS, plano, REV o titulo..." /></label>
          <span>{filtered.length} planos</span>
          {isAdmin && <><a className="btn btn-secondary" href="/Plantilla.xlsx" download><Download size={15} /> Plantilla</a><button className="btn btn-secondary" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? <LoaderCircle className="planos-spinner" size={15} /> : <FileSpreadsheet size={15} />} {importing ? 'Importando...' : 'Importar Excel'}</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={importExcel} /><button className="btn btn-primary" disabled={importing} onClick={() => { setForm(emptyForm); setEditing(true); }}><Plus size={15} /> Nuevo</button></>}
        </div>
        {importing && <div className="planos-import-progress"><LoaderCircle className="planos-spinner" size={24} /><span>Validando e importando. No cierre esta ventana.</span></div>}
        {message && <div className="message warning planos-message">{message}</div>}
        <div className="planos-table-wrap">
          <table className="planos-table"><thead><tr>
            {[['wbs','WBS'],['plano','PLANO'],['revision','REV'],['sistema','TITULO'],['document_url','URL']].map(([field, label]) => <th key={field}><button className="planos-sort" onClick={() => sortBy(field)}>{label}<ArrowUpDown size={12} className={sortField === field && sortDirection === 'desc' ? 'flipped' : ''} /></button></th>)}
          </tr></thead><tbody>
            {editing && !form.id && editorRow()}
            {loading ? <tr><td colSpan="5">Cargando...</td></tr> : filtered.length === 0 && !(editing && !form.id) ? <tr><td colSpan="5">No hay planos registrados en la partición PUESTA A TIERRA.</td></tr> : groupedRows.map(group => <React.Fragment key={group.wbs}>
              <tr className="planos-wbs-row"><td colSpan="4"><div className="planos-wbs-heading">{isAdmin && <button className={`planos-group-select${selectedGroups.has(group.id) ? ' selected' : ''}`} onClick={() => toggleGroup(group.id)} title="Seleccionar WBS">{selectedGroups.has(group.id) ? <CheckSquare size={15} /> : <Square size={15} />}</button>}<strong>{group.wbs}</strong>{isAdmin && selectedGroups.has(group.id) && <button className="planos-group-delete" onClick={() => removeGroup(group)} title="Eliminar WBS completo"><Trash2 size={14} /> Eliminar WBS</button>}</div></td><td className={`planos-group-url-cell${editingGroup?.id === group.id ? ' editing' : ''}`}>{editingGroup?.id === group.id ? <div className="planos-group-url-editor"><input value={editingGroup.url} onChange={e => setEditingGroup({ ...editingGroup, url: e.target.value })} placeholder="https://..." /><button onClick={() => saveGroupUrl(group)}>Guardar</button><button onClick={() => setEditingGroup(null)}>Cancelar</button></div> : <div className="planos-group-url">{group.url ? <a href={group.url} target="_blank" rel="noopener noreferrer">Abrir carpeta<ExternalLink size={13} /></a> : <span>Sin URL</span>}{isAdmin && <button onClick={() => setEditingGroup({ id: group.id, url: group.url || '' })} title="Editar URL del WBS"><Pencil size={13} /></button>}</div>}</td></tr>
              {group.rows.map(row => editing && form.id === row.id ? editorRow(row.id) : <tr key={row.id}>
                <td></td><td>{row.plano}</td><td>{row.revision || '—'}</td><td>{row.sistema}</td><td className="planos-link-cell">{isAdmin && <span><button onClick={() => { setForm(row); setEditing(true); }} title="Editar REV y TITULO"><Pencil size={13} /></button><button className="planos-row-delete" onClick={() => remove(row)} title="Eliminar plano"><Trash2 size={13} /></button></span>}</td>
              </tr>)}</React.Fragment>)}</tbody></table>
        </div>
      </aside>

      {deletePlanoTarget && (
        <div className="dialog-overlay planos-dialog-overlay" onClick={() => setDeletePlanoTarget(null)}>
          <div className="dialog-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540, width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={16} style={{ color: 'var(--danger)' }} />
                <span>Eliminar plano</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 24 }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: '0.88rem' }}>
                Esta acción eliminará permanentemente el plano <strong>{deletePlanoTarget.plano}</strong>.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 18, fontSize: '0.85rem' }}>
                <span><strong>WBS:</strong> {deletePlanoTarget.wbs || '—'}</span>
                <span><strong>Plano:</strong> {deletePlanoTarget.plano}</span>
                <span><strong>Revision:</strong> {deletePlanoTarget.revision || '—'}</span>
                <span><strong>Titulo:</strong> {deletePlanoTarget.sistema || '—'}</span>
              </div>
              <div className="form-group">
                <label>Escriba <strong>{deletePlanoTarget.plano}</strong> para confirmar</label>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button className="btn btn-secondary" onClick={() => setDeletePlanoTarget(null)} disabled={deleteLoading}>
                  Cancelar
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleConfirmDeletePlano}
                  disabled={deleteLoading || deleteConfirmation !== deletePlanoTarget.plano}
                >
                  {deleteLoading ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteGroupTarget && (
        <div className="dialog-overlay planos-dialog-overlay" onClick={() => setDeleteGroupTarget(null)}>
          <div className="dialog-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540, width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={16} style={{ color: 'var(--danger)' }} />
                <span>Eliminar WBS Completo</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 24 }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: '0.88rem' }}>
                Esta acción eliminará permanentemente el WBS <strong>{deleteGroupTarget.wbs}</strong> y todos sus planos relacionados.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 18, fontSize: '0.85rem' }}>
                <span><strong>WBS a eliminar:</strong> {deleteGroupTarget.wbs}</span>
                <span><strong>Cantidad de planos:</strong> {deleteGroupTarget.rows?.length || 0}</span>
              </div>
              <div className="form-group">
                <label>Escriba <strong>{deleteGroupTarget.wbs}</strong> para confirmar</label>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button className="btn btn-secondary" onClick={() => setDeleteGroupTarget(null)} disabled={deleteLoading}>
                  Cancelar
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleConfirmDeleteGroup}
                  disabled={deleteLoading || deleteConfirmation !== deleteGroupTarget.wbs}
                >
                  {deleteLoading ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
