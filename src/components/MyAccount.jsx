import React, { useState } from 'react';
import { Mail, Shield, KeyRound, History, Bell, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useProjectArea } from '../contexts/ProjectAreaContext';
import { useAccountActivity } from '../features/accounts/presentation/hooks/useAccountActivity';
import { usePasswordChange } from '../features/accounts/presentation/hooks/usePasswordChange';
import AdminAccountRequestsButton from './AdminAccountRequestsButton';

const ROLE_LABELS = { admin: 'Administrador', supervisor: 'Supervisor', user: 'Usuario' };

export default function MyAccount({ user, onManageAccountRequests }) {
  const { role, isAdmin, availableAreas } = useProjectArea();
  const { activity, loading: loadingActivity, error: activityError } = useAccountActivity();
  const {
    saving: savingPassword,
    message: passwordMessage,
    clearMessage: clearPasswordMessage,
    changePassword,
  } = usePasswordChange(user?.email);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const savePassword = async (event) => {
    event.preventDefault();
    const changed = await changePassword({
      currentPassword,
      password,
      confirmPassword,
    });
    if (!changed) return;
    setCurrentPassword('');
    setPassword('');
    setConfirmPassword('');
    setEditingPassword(false);
  };

  return (
    <div className="my-account-page">
      <div className="my-account-sections">
        <section className="card my-account-profile-card my-account-section">
          <div className="card-header"><Shield size={18} /><strong>Información de la Cuenta</strong></div>
          <div className="card-body my-account-details">
            <div><Mail size={17} /><span><small>Correo electrónico</small><strong>{user?.email || '—'}</strong></span></div>
            <div><Shield size={17} /><span><small>Nivel de acceso</small><strong>{ROLE_LABELS[role] || role || '—'}</strong></span></div>
            <div><Shield size={17} /><span><small>Áreas disponibles</small><strong>{isAdmin ? 'Todas las áreas' : availableAreas.map(area => area.name).join(', ') || '—'}</strong></span></div>
            <div><KeyRound size={17} /><span><small>Contraseña</small><strong>•••••••• · Protegida</strong></span></div>
            <button className="btn btn-secondary" onClick={() => setEditingPassword(value => !value)}>
              <KeyRound size={15} /> Cambiar contraseña
            </button>
            {editingPassword && (
              <form className="my-account-password-form" onSubmit={savePassword}>
                <div className="form-group">
                  <label htmlFor="accountCurrentPassword">Contraseña actual</label>
                  <input id="accountCurrentPassword" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
                </div>
                <div className="form-group">
                  <label htmlFor="accountNewPassword">Nueva contraseña</label>
                  <input id="accountNewPassword" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required />
                </div>
                <div className="form-group">
                  <label htmlFor="accountConfirmPassword">Confirmar nueva contraseña</label>
                  <input id="accountConfirmPassword" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
                </div>
                <div className="my-account-password-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setEditingPassword(false);
                    setCurrentPassword('');
                    setPassword('');
                    setConfirmPassword('');
                    clearPasswordMessage();
                  }}>Cancelar</button>
                  <button className="btn btn-primary" disabled={savingPassword}><Save size={15} />{savingPassword ? 'Verificando...' : 'Actualizar contraseña'}</button>
                </div>
              </form>
            )}
            {passwordMessage.text && <div className={`message ${passwordMessage.type}`}>{passwordMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{passwordMessage.text}</div>}
          </div>
        </section>

        <section className="card my-account-section my-account-notifications-card">
          <div className="card-header"><Bell size={18} /><strong>Notificaciones</strong></div>
          <div className="card-body my-account-notifications">
            {isAdmin ? <><p>Revise las solicitudes pendientes para crear cuentas.</p><AdminAccountRequestsButton showLabel onManage={onManageAccountRequests} /></> : <p>No hay notificaciones disponibles.</p>}
          </div>
        </section>

      <section className="card my-account-activity-card my-account-section">
        <div className="card-header"><History size={18} /><strong>Mis Últimas Modificaciones</strong></div>
        <div className="card-body">
          {loadingActivity ? <div className="account-requests-empty"><span className="spinner" /> Cargando actividad...</div> : activityError ?
            <div className="message error"><AlertCircle size={16} />{activityError}</div> : activity.length === 0 ?
            <div className="account-requests-empty">Todavía no hay modificaciones registradas para esta cuenta.</div> :
            <div className="my-account-activity-list">{activity.map((item, index) => (
              <div className="my-account-activity-item" key={`${item.occurred_at}-${index}`}>
                <span>{new Date(item.occurred_at).toLocaleString('es-PE')}</span>
                <strong>{item.description}</strong>
                <code>{item.record_reference || '—'}</code>
              </div>
            ))}</div>}
        </div>
      </section>
      </div>
    </div>
  );
}
