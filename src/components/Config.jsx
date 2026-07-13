import React, { useState } from 'react';
import { supabase } from '../supabase';
import { createClient } from '@supabase/supabase-js';
import { Settings, ShieldAlert, CheckCircle2, AlertCircle, X, HelpCircle, UserPlus, Shield, Mail, KeyRound } from 'lucide-react';

export default function Config() {
  const [resultMsg, setResultMsg] = useState({ text: '', type: '' });
  const [loadingAction, setLoadingAction] = useState(false);

  // Reset modal states
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: DNI entry, 2: Final confirmation, 3: Success
  const [dni, setDni] = useState('');
  const [dniError, setDniError] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  // User creation states
  const [userAdminDni, setUserAdminDni] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [newAdminDni, setNewAdminDni] = useState('');
  const [newAdminNombre, setNewAdminNombre] = useState('');
  const [userMsg, setUserMsg] = useState({ text: '', type: '' });
  const [creatingUser, setCreatingUser] = useState(false);
  // User management unlock states
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockDni, setUnlockDni] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  // Validate integrity via server-side RPC
  const handleValidateIntegrity = async () => {
    setResultMsg({ text: '', type: '' });
    setLoadingAction(true);
    try {
      const { data, error } = await supabase.rpc('validar_integridad');
      if (error) throw error;

      if (data.is_healthy) {
        setResultMsg({
          text: 'Integridad verificada con éxito. No se encontraron inconsistencias en la base de datos.',
          type: 'success'
        });
      } else {
        const issues = [];
        if (data.orphaned_movements > 0) issues.push(`${data.orphaned_movements} movimientos huérfanos`);
        if (data.negative_stock > 0) issues.push(`${data.negative_stock} productos con stock negativo`);
        if (data.invalid_tipos > 0) issues.push(`${data.invalid_tipos} movimientos con tipo inválido`);
        setResultMsg({
          text: `Se detectaron inconsistencias: ${issues.join(', ')}.`,
          type: 'error'
        });
      }
    } catch (err) {
      console.error('Integrity validation error:', err);
      setResultMsg({
        text: 'Error al validar integridad: ' + err.message,
        type: 'error'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Check Supabase connection
  const handleCheckConnection = async () => {
    setResultMsg({ text: '', type: '' });
    setLoadingAction(true);
    try {
      const { error } = await supabase.from('unidades').select('count', { head: true });
      if (error) throw error;
      setResultMsg({
        text: 'Conexión a la base de datos Supabase establecida exitosamente. Las tablas del sistema responden correctamente.',
        type: 'success'
      });
    } catch (err) {
      console.error('Database check connection error:', err);
      setResultMsg({
        text: 'Error de conexión a la base de datos: ' + err.message,
        type: 'error'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Open reset confirmation wizard
  const handleOpenReset = () => {
    setDni('');
    setDniError('');
    setResetError('');
    setResetStep(1);
    setShowResetModal(true);
  };

  // Wizard Step navigation helpers
  const handleGoToStep2 = () => {
    setDniError('');
    const cleanDni = dni.trim();

    if (!cleanDni) {
      setDniError('El DNI es obligatorio.');
      return;
    }

    if (!/^\d+$/.test(cleanDni)) {
      setDniError('El DNI debe contener únicamente dígitos numéricos.');
      return;
    }

    if (cleanDni.length !== 8) {
      setDniError('El DNI debe tener exactamente 8 dígitos.');
      return;
    }

    setResetStep(2);
  };

  // Execute Supabase Database Reset RPC call
  const handleExecuteReset = async () => {
    setResetError('');
    setResetting(true);

    try {
      const { error } = await supabase.rpc('reset_sistema_autorizado', {
        admin_dni: dni.trim()
      });

      if (error) throw error;

      setResetStep(3);
    } catch (err) {
      console.error('System reset error:', err);
      const errMsg = err.message || err.details || '';
      if (errMsg.includes('no está autorizado')) {
        setResultMsg({ text: 'DNI no autorizado.', type: 'error' });
        setShowResetModal(false);
      } else {
        setResetError('Error al restablecer la base de datos: ' + (errMsg || 'Error desconocido'));
      }
    } finally {
      setResetting(false);
    }
  };

  // Verify administrator DNI to unlock user management section
  const handleUnlockUserManagement = async (e) => {
    e.preventDefault();
    setUnlockError('');
    setUnlocking(true);

    const cleanDni = unlockDni.trim();
    if (!cleanDni) {
      setUnlockError('El DNI es obligatorio.');
      setUnlocking(false);
      return;
    }

    try {
      const { data: isAdmin, error: adminErr } = await supabase.rpc('es_administrador', { p_dni: cleanDni });
      if (adminErr) throw adminErr;

      if (isAdmin) {
        setIsUnlocked(true);
        setUserAdminDni(cleanDni); // Pre-fill authorizing DNI
      } else {
        setUnlockError('El DNI ingresado no está registrado como administrador.');
      }
    } catch (err) {
      console.error('Error unlocking user management:', err);
      setUnlockError('Error de verificación: ' + (err.message || 'Error desconocido'));
    } finally {
      setUnlocking(false);
    }
  };

  // Create user account from Web
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserMsg({ text: '', type: '' });
    setCreatingUser(true);

    const authorizingDni = userAdminDni.trim();
    const email = newUserEmail.trim();
    const password = newUserPassword;
    const adminDniVal = newAdminDni.trim();
    const adminNombreVal = newAdminNombre.trim();

    if (!authorizingDni) {
      setUserMsg({ text: 'Debe ingresar su DNI de administrador para autorizar.', type: 'error' });
      setCreatingUser(false);
      return;
    }

    if (!email || !password) {
      setUserMsg({ text: 'El correo y la contraseña son obligatorios.', type: 'error' });
      setCreatingUser(false);
      return;
    }

    if (makeAdmin && (!adminDniVal || !adminNombreVal)) {
      setUserMsg({ text: 'Si el usuario es administrador, debe ingresar el DNI y el nombre del nuevo administrador.', type: 'error' });
      setCreatingUser(false);
      return;
    }

    try {
      // 1. Validate authorizing DNI using RPC 'es_administrador'
      const { data: isAdmin, error: adminErr } = await supabase.rpc('es_administrador', { p_dni: authorizingDni });
      if (adminErr) throw adminErr;
      if (!isAdmin) {
        setUserMsg({ text: 'El DNI ingresado no tiene permisos de administrador para autorizar.', type: 'error' });
        setCreatingUser(false);
        return;
      }

      // 2. Create a temporary client to sign up the new user without breaking the current session
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Las credenciales de Supabase no están configuradas.');
      }

      const tempClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { error: signUpError } = await tempClient.auth.signUp({
        email,
        password
      });

      if (signUpError) throw signUpError;

      // 3. If "makeAdmin" is checked, insert the new admin in the DB via RPC 'crear_administrador_autorizado'
      if (makeAdmin) {
        const { error: makeAdminError } = await supabase.rpc('crear_administrador_autorizado', {
          p_admin_dni_autorizador: authorizingDni,
          p_nuevo_dni: adminDniVal,
          p_nuevo_nombre: adminNombreVal
        });
        if (makeAdminError) throw makeAdminError;
      }

      setUserMsg({
        text: `Usuario ${email} registrado con éxito.${makeAdmin ? ' Registrado como administrador.' : ''}`,
        type: 'success'
      });

      // Clear fields
      setUserAdminDni('');
      setNewUserEmail('');
      setNewUserPassword('');
      setMakeAdmin(false);
      setNewAdminDni('');
      setNewAdminNombre('');
    } catch (err) {
      console.error('Error creating user:', err);
      setUserMsg({
        text: 'Error al registrar usuario: ' + (err.message || 'Error desconocido'),
        type: 'error'
      });
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div id="configuracion" className="tab-content active">
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={18} />
            <span>Herramientas de Administración del Sistema</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Realice pruebas de diagnóstico o restablezca la base de datos de inventario. Estas acciones afectan directamente las tablas de Supabase.
          </p>

          <div className="actions">
            <button 
              className="btn btn-primary" 
              onClick={handleValidateIntegrity}
              disabled={loadingAction}
            >
              <span>Validar Integridad</span>
            </button>
            <button 
              className="btn btn-success" 
              onClick={handleCheckConnection}
              disabled={loadingAction}
            >
              <span>Prueba de Conexión</span>
            </button>
            <button 
              className="btn btn-danger" 
              onClick={handleOpenReset}
              disabled={loadingAction}
            >
              <ShieldAlert size={16} />
              <span>Restablecer Sistema</span>
            </button>
          </div>

          {resultMsg.text && (
            <div className={`message ${resultMsg.type}`} style={{ marginTop: '20px' }}>
              {resultMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{resultMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* User Account Assignment Card */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserPlus size={18} />
            <span>Gestión de Usuarios</span>
          </div>
        </div>
        <div className="card-body">
          {!isUnlocked ? (
            <div style={{ maxWidth: '400px', margin: '0 auto', padding: '12px 0', textAlign: 'center' }}>
              <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                La creación de cuentas de usuario está restringida. Ingrese su DNI de administrador para desbloquear esta sección.
              </p>
              <form onSubmit={handleUnlockUserManagement}>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="unlockDniInput" style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                    DNI de Administrador
                  </label>
                  <input 
                    type="text" 
                    id="unlockDniInput" 
                    placeholder="8 dígitos" 
                    value={unlockDni}
                    onChange={(e) => setUnlockDni(e.target.value.replace(/\D/g, ''))}
                    maxLength={8}
                    style={{ textAlign: 'center', fontSize: '1rem', padding: '10px' }}
                    required
                  />
                </div>
                {unlockError && (
                  <div className="message error" style={{ marginBottom: '16px' }}>
                    <AlertCircle size={16} />
                    <span>{unlockError}</span>
                  </div>
                )}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={unlocking}>
                  {unlocking ? 'Verificando...' : 'Desbloquear Gestión'}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--success)' }}>
                  ✓ Sección desbloqueada (Admin DNI: {userAdminDni})
                </span>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }} 
                  onClick={() => {
                    setIsUnlocked(false);
                    setUnlockDni('');
                    setUserAdminDni('');
                  }}
                >
                  Volver a bloquear
                </button>
              </div>

              <form onSubmit={handleCreateUser}>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="authAdminDni" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Shield size={16} style={{ color: 'var(--danger)' }} />
                      <span>DNI Autorizador *</span>
                    </label>
                    <input 
                      type="text" 
                      id="authAdminDni" 
                      placeholder="DNI de Administrador"
                      value={userAdminDni}
                      readOnly
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="newUserEmail" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Mail size={16} style={{ color: 'var(--primary)' }} />
                      <span>Correo Electrónico *</span>
                    </label>
                    <input 
                      type="email" 
                      id="newUserEmail" 
                      placeholder="correo@ejemplo.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="newUserPassword" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <KeyRound size={16} style={{ color: 'var(--primary)' }} />
                      <span>Contraseña *</span>
                    </label>
                    <input 
                      type="password" 
                      id="newUserPassword" 
                      placeholder="Mínimo 6 caracteres"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required 
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: '20px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                    <input 
                      type="checkbox" 
                      checked={makeAdmin}
                      onChange={(e) => setMakeAdmin(e.target.checked)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>¿Registrar también como Administrador?</span>
                  </label>
                </div>

                {makeAdmin && (
                  <div className="form-grid" style={{ 
                    background: 'var(--bg-card-header)', 
                    padding: '16px', 
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid var(--border-color)',
                    marginBottom: '20px',
                    animation: 'fadeIn 0.3s ease'
                  }}>
                    <div className="form-group">
                      <label htmlFor="newAdminDni">DNI del Nuevo Administrador *</label>
                      <input 
                        type="text" 
                        id="newAdminDni" 
                        placeholder="8 dígitos"
                        value={newAdminDni}
                        onChange={(e) => setNewAdminDni(e.target.value.replace(/\D/g, ''))}
                        maxLength={8}
                        required={makeAdmin}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="newAdminNombre">Nombre del Nuevo Administrador *</label>
                      <input 
                        type="text" 
                        id="newAdminNombre" 
                        placeholder="Nombre Completo"
                        value={newAdminNombre}
                        onChange={(e) => setNewAdminNombre(e.target.value)}
                        required={makeAdmin}
                      />
                    </div>
                  </div>
                )}

                <div className="actions">
                  <button 
                    type="submit" 
                    className="btn btn-success" 
                    disabled={creatingUser}
                  >
                    <UserPlus size={16} />
                    <span>{creatingUser ? 'Registrando...' : 'Crear Usuario'}</span>
                  </button>
                </div>
              </form>

              {userMsg.text && (
                <div className={`message ${userMsg.type}`} style={{ marginTop: '20px' }}>
                  {userMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{userMsg.text}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reusable step-by-step Reset Confirmation Modal */}
      {showResetModal && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                <span style={{ fontWeight: '700', letterSpacing: '0.3px' }}>Advertencia de Restablecimiento</span>
              </div>
            </div>

            <div className="card-body" style={{ padding: '24px', textAlign: 'center' }}>
              
              {/* Premium Visual Step Progress Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  background: resetStep === 1 ? 'var(--primary-glow)' : 'transparent',
                  border: resetStep === 1 ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: resetStep === 1 ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.3s ease'
                }}>
                  1. Autorización
                </div>
                <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }}></div>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  background: resetStep === 2 ? 'var(--primary-glow)' : 'transparent',
                  border: resetStep === 2 ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: resetStep === 2 ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.3s ease'
                }}>
                  2. Confirmación
                </div>
                <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }}></div>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  background: resetStep === 3 ? 'var(--primary-glow)' : 'transparent',
                  border: resetStep === 3 ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: resetStep === 3 ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.3s ease'
                }}>
                  3. Listo
                </div>
              </div>

              {/* Step 1: Warnings and DNI form */}
              {resetStep === 1 && (
                <div>
                  <div style={{
                    background: 'var(--danger-bg)',
                    borderLeft: '4px solid var(--danger)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    color: 'var(--danger-text)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center'
                  }}>
                    <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                    <span>
                      Esta acción eliminará permanentemente <strong>TODOS los registros de productos</strong> y sus <strong>movimientos históricos</strong> del almacén. Esta operación es irreversible.
                    </span>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <label htmlFor="resetDniInput" style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.875rem' }}>
                      DNI
                    </label>
                    <input 
                      type="text" 
                      id="resetDniInput" 
                      placeholder="8 dígitos" 
                      value={dni}
                      onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                      maxLength={8}
                      autoComplete="off"
                      style={{ maxWidth: '120px', width: '100%', textAlign: 'center', fontSize: '0.95rem', padding: '10px 12px' }}
                    />
                    {dniError && (
                      <span style={{ color: 'var(--danger)', fontSize: '0.825rem', marginTop: '6px', fontWeight: '600', display: 'block' }}>
                        {dniError}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '28px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleGoToStep2}>
                      Continuar
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Final confirmation step */}
              {resetStep === 2 && (
                <div>
                  <div style={{
                    background: 'var(--warning-bg)',
                    borderLeft: '4px solid var(--warning)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    color: 'var(--warning-text)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center'
                  }}>
                    <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
                    <span>
                      Se guardará el registro de restablecimiento bajo la identificación DNI: <strong>{dni}</strong>.
                    </span>
                  </div>

                  {resetError && (
                    <div className="message error" style={{ marginBottom: '16px' }}>
                      <AlertCircle size={16} />
                      <span>{resetError}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '28px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => setResetStep(1)}
                      disabled={resetting}
                    >
                      Atrás
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-danger" 
                      onClick={handleExecuteReset}
                      disabled={resetting}
                    >
                      {resetting ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', marginBottom: 0 }}></span>
                          <span>Restableciendo...</span>
                        </div>
                      ) : (
                        'Restablecer Todo'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Success view */}
              {resetStep === 3 && (
                <div>
                  <div style={{
                    background: 'var(--success-bg)',
                    borderLeft: '4px solid var(--success)',
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    color: 'var(--success-text)',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    lineHeight: '1.6'
                  }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      background: 'rgba(16, 185, 129, 0.15)', 
                      borderRadius: '50%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      margin: '0 auto 12px auto',
                      color: 'var(--success)'
                    }}>
                      <CheckCircle2 size={28} />
                    </div>
                    <h4 style={{ fontWeight: '700', marginBottom: '8px', fontSize: '1.05rem', letterSpacing: '0.2px' }}>¡Restablecimiento Completado!</h4>
                    La base de datos ha sido restablecida a su estado inicial de forma exitosa. Todos los productos y logs de movimientos fueron eliminados de forma segura.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
                    <button type="button" className="btn btn-success" onClick={() => setShowResetModal(false)}>
                      Cerrar
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
