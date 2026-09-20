import React, { useState } from 'react';
import { supabase } from '../supabase';
import { KeyRound, Mail, AlertCircle, ArrowLeft, UserPlus } from 'lucide-react';

export default function Login({ passwordRecovery = false, onPasswordRecoveryComplete }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestArea, setRequestArea] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [view, setView] = useState(passwordRecovery ? 'update-password' : 'login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage(error.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    clearMessages();
    if (!email.trim()) {
      setErrorMessage('Ingrese el correo electrónico asociado a su cuenta.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setSuccessMessage('Si el correo está registrado, recibirá un enlace para restablecer la contraseña.');
    } catch (error) {
      console.error('Password reset error:', error);
      setErrorMessage(error.message || 'No se pudo enviar el enlace de recuperación.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (event) => {
    event.preventDefault();
    clearMessages();
    if (password.length < 8) {
      setErrorMessage('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      window.history.replaceState({}, document.title, window.location.pathname);
      onPasswordRecoveryComplete?.();
    } catch (error) {
      console.error('Password update error:', error);
      setErrorMessage(error.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountRequest = async (event) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const { error } = await supabase.rpc('submit_account_request', {
        p_full_name: requestName.trim(),
        p_email: email.trim(),
        p_area_code: requestArea,
        p_message: requestMessage.trim() || null,
      });
      if (error) throw error;
      setSuccessMessage('Solicitud enviada. Un administrador podrá revisarla dentro del sistema.');
      setRequestName('');
      setEmail('');
      setRequestArea('');
      setRequestMessage('');
    } catch (error) {
      console.error('Account request error:', error);
      setErrorMessage(error.message || 'No se pudo enviar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const isUpdateView = view === 'update-password';
  const isResetView = view === 'reset';
  const isRequestView = view === 'request';

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <h2>{isUpdateView ? 'Nueva Contraseña' : isResetView ? 'Reset Password' : isRequestView ? 'Create an account' : 'Log-In'}</h2>
          {!isUpdateView && !isResetView && !isRequestView && <p>OT E&amp;I</p>}
        </div>

        <form onSubmit={isUpdateView ? handleUpdatePassword : isResetView ? handleResetPassword : isRequestView ? handleAccountRequest : handleLogin}>
          {isRequestView && (
            <div className="form-group login-form-group">
              <label htmlFor="requestName"><UserPlus size={16} /><span>Nombre Completo</span></label>
              <input type="text" id="requestName" value={requestName}
                onChange={(event) => setRequestName(event.target.value)} maxLength={120} required />
            </div>
          )}

          {!isUpdateView && (
            <div className="form-group login-form-group">
              <label htmlFor="loginEmail"><Mail size={16} /><span>Correo Electrónico</span></label>
              <input type="email" id="loginEmail" placeholder="correo@ejemplo.com" value={email}
                onChange={(event) => setEmail(event.target.value)} required />
            </div>
          )}

          {!isResetView && !isRequestView && (
            <div className="form-group login-form-group">
              <label htmlFor="loginPassword"><KeyRound size={16} /><span>{isUpdateView ? 'Nueva Contraseña' : 'Contraseña'}</span></label>
              <input type="password" id="loginPassword" placeholder="••••••••" value={password}
                onChange={(event) => setPassword(event.target.value)} required />
            </div>
          )}

          {isUpdateView && (
            <div className="form-group login-form-group">
              <label htmlFor="confirmPassword"><KeyRound size={16} /><span>Confirmar Contraseña</span></label>
              <input type="password" id="confirmPassword" placeholder="••••••••" value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
          )}

          {isRequestView && (
            <>
              <div className="form-group login-form-group">
                <label htmlFor="requestArea">Área solicitada</label>
                <select id="requestArea" value={requestArea} onChange={(event) => setRequestArea(event.target.value)} required>
                  <option value="">Seleccione un área</option>
                  <option value="SECA">Área Seca</option>
                  <option value="HUMEDA">Área Húmeda</option>
                </select>
              </div>
              <div className="form-group login-form-group">
                <label htmlFor="requestMessage">Mensaje opcional</label>
                <textarea id="requestMessage" rows={3} maxLength={50} value={requestMessage}
                  onChange={(event) => setRequestMessage(event.target.value)} />
                <div className="login-character-count">{requestMessage.length}/50</div>
              </div>
            </>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <><span className="spinner login-spinner" /><span>Procesando...</span></> :
              isUpdateView ? 'Guardar Contraseña' : isResetView ? 'Enviar Enlace' : isRequestView ? 'Enviar Solicitud' : 'Ingresar'}
          </button>
        </form>

        {errorMessage && <div className="message error"><AlertCircle size={16} /><span>{errorMessage}</span></div>}
        {successMessage && <div className="message success"><span>{successMessage}</span></div>}

        {!isUpdateView && (
          <div className="login-links">
            {isResetView || isRequestView ? (
              <button type="button" className="login-link" onClick={() => { clearMessages(); setView('login'); }}>
                <ArrowLeft size={14} /> Volver al Log-In
              </button>
            ) : (
              <button type="button" className="login-link" onClick={() => { clearMessages(); setView('reset'); }}>Reset Password</button>
            )}
            {!isRequestView && (
              <button type="button" className="login-link" onClick={() => { clearMessages(); setView('request'); }}>Create an account</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
