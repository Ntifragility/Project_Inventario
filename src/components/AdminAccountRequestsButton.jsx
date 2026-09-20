import React, { useCallback, useEffect, useState } from 'react';
import { Bell, X, UserPlus } from 'lucide-react';
import { supabase } from '../supabase';
import { useProjectArea } from '../contexts/ProjectAreaContext';

export default function AdminAccountRequestsButton({ onManage, showLabel = false }) {
  const { isAdmin } = useProjectArea();
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRequests = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: requestError } = await supabase.rpc('list_account_requests', { p_status: 'pending' });
      if (requestError) throw requestError;
      setRequests(data || []);
    } catch (requestError) {
      console.error('Error loading account request notifications:', requestError);
      setError('No se pudieron cargar las solicitudes. Verifique la migración de la base de datos.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    fetchRequests();
    const timer = window.setInterval(fetchRequests, 60000);
    return () => window.clearInterval(timer);
  }, [isAdmin, fetchRequests]);

  if (!isAdmin) return null;

  return (
    <>
      <button
        type="button"
        className={`admin-notification-button ${showLabel ? 'with-label' : ''}`}
        onClick={() => { setOpen(true); fetchRequests(); }}
        title="Solicitudes de cuenta"
        aria-label={`Solicitudes de cuenta${requests.length ? `: ${requests.length} pendientes` : ''}`}
      >
        <Bell size={18} />
        {showLabel && <span>Solicitudes de cuenta</span>}
        {requests.length > 0 && <span className="admin-notification-badge">{requests.length}</span>}
      </button>

      {open && (
        <div className="dialog-overlay" onClick={() => setOpen(false)}>
          <div className="dialog-card admin-notification-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="card-header admin-notification-header">
              <div><Bell size={18} /><strong>Solicitudes de Cuenta</strong></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}><X size={15} /></button>
            </div>
            <div className="card-body admin-notification-list">
              {loading && requests.length === 0 ? (
                <div className="account-requests-empty"><span className="spinner" /> Cargando...</div>
              ) : error ? (
                <div className="message error">{error}</div>
              ) : requests.length === 0 ? (
                <div className="account-requests-empty">No hay solicitudes pendientes.</div>
              ) : requests.map((request) => (
                <div className="account-request-item" key={request.id}>
                  <div className="account-request-main">
                    <strong>{request.full_name}</strong>
                    <span>{request.email}</span>
                    <span>{request.requested_area_code === 'HUMEDA' ? 'Área Húmeda' : 'Área Seca'} · {new Date(request.created_at).toLocaleString('es-PE')}</span>
                    {request.message && <p>{request.message}</p>}
                  </div>
                </div>
              ))}
            </div>
            {onManage && <div className="admin-notification-footer">
              <button className="btn btn-primary" onClick={() => { setOpen(false); onManage?.(); }}>
                <UserPlus size={16} /> Gestionar Solicitudes
              </button>
            </div>}
          </div>
        </div>
      )}
    </>
  );
}
