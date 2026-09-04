import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';

/**
 * CableDispatchModal
 * Modal to manage partial and total dispatches for a specific cable TAG.
 * Strict UI: No icons, pure text buttons.
 *
 * Props:
 * - open: boolean
 * - cable: { id, tag_unico, total_estimado_m, total_despachado_m, sistema, material, area }
 * - initialTab: 'register' | 'history'
 * - canManage: boolean (allows adding/editing/deleting)
 * - activeAreaId: string | number
 * - onClose: () => void
 * - onSaved: () => Promise<void> | void
 */
export default function CableDispatchModal({
  open,
  cable,
  initialTab = 'register',
  canManage = true,
  activeAreaId,
  onClose,
  onSaved,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [despachos, setDespachos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [formMetrado, setFormMetrado] = useState('');
  const [formVale, setFormVale] = useState('');
  const [formFecha, setFormFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [formRecibidoPor, setFormRecibidoPor] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Sync initial tab when opening
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setError('');
      setSuccessMsg('');
      resetForm();
    }
  }, [open, initialTab]);

  const fetchDespachos = useCallback(async () => {
    if (!cable?.tag_unico) return;
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('cable_despachos')
        .select('*')
        .eq('tag_unico', cable.tag_unico)
        .order('fecha_entrega', { ascending: false })
        .order('id', { ascending: false });

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      setDespachos(data || []);
    } catch (err) {
      console.error('Error fetching despachos:', err);
      setError('Error al cargar el historial de despachos.');
    } finally {
      setLoading(false);
    }
  }, [cable?.tag_unico]);

  useEffect(() => {
    if (open && cable?.tag_unico) {
      fetchDespachos();
    }
  }, [open, cable?.tag_unico, fetchDespachos]);

  const resetForm = () => {
    setEditingId(null);
    setFormMetrado('');
    setFormVale('');
    setFormFecha(new Date().toISOString().slice(0, 10));
    setFormRecibidoPor('');
    setDeleteConfirmId(null);
  };

  const handleStartEditItem = (item) => {
    setEditingId(item.id);
    setFormMetrado(item.longitud_despachada_m != null ? String(item.longitud_despachada_m) : '');
    setFormVale(item.vale_almacen || '');
    setFormFecha(item.fecha_entrega ? String(item.fecha_entrega).slice(0, 10) : new Date().toISOString().slice(0, 10));
    setFormRecibidoPor(item.solicitado_por || '');
    setActiveTab('register');
    setError('');
    setSuccessMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const metradoNum = parseFloat(formMetrado);
    if (isNaN(metradoNum) || metradoNum <= 0) {
      setError('Ingrese un metrado numérico válido mayor a cero.');
      return;
    }

    if (!formFecha) {
      setError('Seleccione una fecha de despacho.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update existing dispatch
        const { error: updateErr } = await supabase
          .from('cable_despachos')
          .update({
            longitud_despachada_m: metradoNum,
            vale_almacen: formVale.trim() || null,
            fecha_entrega: formFecha,
            solicitado_por: formRecibidoPor.trim() || null,
          })
          .eq('id', editingId);

        if (updateErr) throw updateErr;
        setSuccessMsg('Despacho actualizado correctamente.');
      } else {
        // Insert new dispatch
        const payload = {
          cable_schedule_id: cable.id,
          tag_unico: cable.tag_unico,
          longitud_despachada_m: metradoNum,
          vale_almacen: formVale.trim() || null,
          fecha_entrega: formFecha,
          solicitado_por: formRecibidoPor.trim() || null,
        };

        const { error: insertErr } = await supabase
          .from('cable_despachos')
          .insert([payload]);

        if (insertErr) throw insertErr;
        setSuccessMsg('Despacho registrado correctamente.');
      }

      resetForm();
      await fetchDespachos();
      if (onSaved) await onSaved();
      setActiveTab('history');
    } catch (err) {
      console.error('Error saving dispatch:', err);
      setError(err.message || 'Error al guardar el despacho.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id) => {
    setSaving(true);
    setError('');
    try {
      const { error: delErr } = await supabase
        .from('cable_despachos')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;

      setDeleteConfirmId(null);
      setSuccessMsg('Despacho eliminado.');
      await fetchDespachos();
      if (onSaved) await onSaved();
    } catch (err) {
      console.error('Error deleting dispatch:', err);
      setError(err.message || 'Error al eliminar el despacho.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportHistory = () => {
    if (!despachos || despachos.length === 0) return;
    try {
      const rowsForExcel = despachos.map((item, index) => ({
        'N°': index + 1,
        'TAG ÚNICO': cable.tag_unico,
        'FECHA DE DESPACHO': item.fecha_entrega ? item.fecha_entrega.slice(0, 10) : '—',
        'VALE (N° Vale Almacén)': item.vale_almacen || '—',
        'METRADO DESPACHADO (m)': parseFloat(item.longitud_despachada_m || 0),
        'RECIBIDO POR': item.solicitado_por || '—',
        'FECHA DE REGISTRO': item.created_at ? new Date(item.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—'
      }));

      const worksheet = XLSX.utils.json_to_sheet(rowsForExcel);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 20 },
        { wch: 22 },
        { wch: 24 },
        { wch: 26 },
        { wch: 22 }
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Despachos');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Despachos_${cable.tag_unico}_${today}.xlsx`);
    } catch (err) {
      console.error('Error exporting single cable dispatches:', err);
      setError('Error al exportar a Excel.');
    }
  };

  if (!open || !cable) return null;

  const totalCalculated = despachos.reduce((sum, d) => sum + (parseFloat(d.longitud_despachada_m) || 0), 0);
  const otMetrado = parseFloat(cable.total_estimado_m) || 0;
  const pctDespachado = otMetrado > 0 ? (totalCalculated / otMetrado) * 100 : 0;

  return (
    <div className="dialog-overlay dispatch-dialog-overlay" onClick={onClose}>
      <div className="dialog-card dispatch-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="dispatch-modal-header">
          <div className="dispatch-modal-header-content">
            <span className="dispatch-modal-subtitle">
              TAG: <strong>{cable.tag_unico}</strong>
            </span>
          </div>
          <button className="dispatch-btn-close" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {/* Tab Navigation (Text only, no icons) */}
        <div className="dispatch-modal-tabs">
          <button
            className={`dispatch-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('register');
              setError('');
            }}
          >
            {editingId ? 'Editar Despacho' : 'Registrar Despacho'}
          </button>
          <button
            className={`dispatch-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              setError('');
            }}
          >
            Historial de Despachos ({despachos.length})
          </button>
        </div>

        {/* Feedback Messages */}
        {error && <div className="dispatch-alert dispatch-alert-error">{error}</div>}
        {successMsg && <div className="dispatch-alert dispatch-alert-success">{successMsg}</div>}

        {/* KPI Summary Banner */}
        <div className="dispatch-summary-banner">
          <div className="dispatch-summary-item">
            <span className="dispatch-summary-label">Metrado OT</span>
            <span className="dispatch-summary-value">{otMetrado.toFixed(1)} m</span>
          </div>
          <div className="dispatch-summary-item">
            <span className="dispatch-summary-label">Despachado</span>
            <span className="dispatch-summary-value accent">{totalCalculated.toFixed(1)} m</span>
          </div>
          <div className="dispatch-summary-item">
            <span className="dispatch-summary-label">% Avance</span>
            <span className="dispatch-summary-value">{pctDespachado.toFixed(0)}%</span>
          </div>
          <div className="dispatch-summary-item">
            <span className="dispatch-summary-label">Entregas</span>
            <span className="dispatch-summary-value">{despachos.length}</span>
          </div>
        </div>

        {/* Tab 1: Registrar / Editar Despacho Form */}
        {activeTab === 'register' && (
          <form className="dispatch-form" onSubmit={handleSubmit}>
            {!canManage && (
              <div className="dispatch-alert dispatch-alert-info">
                Modo solo lectura: No tienes permisos para registrar o editar despachos.
              </div>
            )}

            <div className="dispatch-form-grid">
              <div className="dispatch-form-group">
                <label className="dispatch-form-label">TAG ÚNICO</label>
                <input
                  type="text"
                  className="dispatch-form-input text-center"
                  value={cable.tag_unico}
                  disabled
                  readOnly
                />
              </div>

              <div className="dispatch-form-group">
                <label className="dispatch-form-label">
                  METRADO DESPACHADO (m) <span className="dispatch-req">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="dispatch-form-input text-center"
                  placeholder="0.00"
                  value={formMetrado}
                  onChange={(e) => setFormMetrado(e.target.value)}
                  disabled={!canManage || saving}
                  required
                  autoFocus
                />
              </div>

              <div className="dispatch-form-group">
                <label className="dispatch-form-label">VALE (N° Vale Almacén)</label>
                <input
                  type="text"
                  className="dispatch-form-input text-center"
                  value={formVale}
                  onChange={(e) => setFormVale(e.target.value)}
                  disabled={!canManage || saving}
                />
              </div>

              <div className="dispatch-form-group">
                <label className="dispatch-form-label">
                  FECHA DE DESPACHO <span className="dispatch-req">*</span>
                </label>
                <input
                  type="date"
                  className="dispatch-form-input text-center"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  disabled={!canManage || saving}
                  required
                />
              </div>

              <div className="dispatch-form-group dispatch-form-group-full">
                <label className="dispatch-form-label">RECIBIDO POR</label>
                <input
                  type="text"
                  className="dispatch-form-input text-center"
                  value={formRecibidoPor}
                  onChange={(e) => setFormRecibidoPor(e.target.value)}
                  disabled={!canManage || saving}
                />
              </div>
            </div>

            <div className="dispatch-form-actions">
              {editingId && (
                <button
                  type="button"
                  className="btn btn-secondary dispatch-btn-text"
                  onClick={resetForm}
                >
                  Cancelar Edición
                </button>
              )}
              {canManage && (
                <button
                  type="submit"
                  className="btn btn-primary dispatch-btn-text"
                  disabled={saving}
                >
                  {saving
                    ? 'Guardando...'
                    : editingId
                    ? 'Actualizar Despacho'
                    : 'Guardar Despacho'}
                </button>
              )}
            </div>
          </form>
        )}

        {/* Tab 2: Historial de Despachos Table */}
        {activeTab === 'history' && (
          <div className="dispatch-history-container">
            {loading ? (
              <div className="dispatch-history-loading">Cargando despachos...</div>
            ) : despachos.length === 0 ? (
              <div className="dispatch-history-empty">
                No hay despachos registrados para este TAG.
                {canManage && (
                  <div style={{ marginTop: '12px' }}>
                    <button
                      className="btn btn-primary dispatch-btn-text"
                      onClick={() => {
                        resetForm();
                        setActiveTab('register');
                      }}
                    >
                      Registrar Despacho
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="dispatch-history-table-wrapper">
                <table className="dispatch-history-table">
                  <thead>
                    <tr>
                      <th style={{ width: '35px', textAlign: 'center' }}>N°</th>
                      <th style={{ width: '110px', textAlign: 'center' }}>Fecha</th>
                      <th style={{ width: '135px' }}>Vale</th>
                      <th style={{ width: '95px', textAlign: 'right' }}>Metrado (m)</th>
                      <th>Recibido Por</th>
                      {canManage && <th style={{ width: '120px', textAlign: 'center' }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {despachos.map((item, index) => {
                      const isDeleting = deleteConfirmId === item.id;
                      return (
                        <tr key={item.id}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            {index + 1}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {item.fecha_entrega || '—'}
                          </td>
                          <td>
                            <strong>{item.vale_almacen || '—'}</strong>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {parseFloat(item.longitud_despachada_m || 0).toFixed(1)} m
                          </td>
                          <td>{item.solicitado_por || '—'}</td>
                          {canManage && (
                            <td style={{ textAlign: 'center' }}>
                              {isDeleting ? (
                                <div className="dispatch-action-confirm">
                                  <span>¿Eliminar?</span>
                                  <button
                                    className="dispatch-btn-danger-sm"
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={saving}
                                  >
                                    Sí
                                  </button>
                                  <button
                                    className="dispatch-btn-secondary-sm"
                                    onClick={() => setDeleteConfirmId(null)}
                                    disabled={saving}
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <div className="dispatch-action-buttons">
                                  <button
                                    className="dispatch-btn-action"
                                    onClick={() => handleStartEditItem(item)}
                                    title="Editar este despacho"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="dispatch-btn-action dispatch-btn-action-delete"
                                    onClick={() => setDeleteConfirmId(item.id)}
                                    title="Eliminar este despacho"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        Total Despachado:
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {totalCalculated.toFixed(1)} m
                      </td>
                      <td colSpan={canManage ? 2 : 1}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="dispatch-history-footer">
              {despachos.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary dispatch-btn-text"
                  onClick={handleExportHistory}
                  title="Descargar historial de este TAG a Excel"
                >
                  Descargar Excel
                </button>
              )}
              {canManage && (
                <button
                  className="btn btn-secondary dispatch-btn-text"
                  onClick={() => {
                    resetForm();
                    setActiveTab('register');
                  }}
                >
                  Nuevo Despacho
                </button>
              )}
              <button className="btn btn-secondary dispatch-btn-text" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

