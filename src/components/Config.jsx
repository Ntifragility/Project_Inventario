import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Settings, ShieldAlert, CheckCircle2, AlertCircle, X, HelpCircle } from 'lucide-react';

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
      setResetError('Error al restablecer la base de datos: ' + (err.message || err.details || 'Error desconocido'));
    } finally {
      setResetting(false);
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

      {/* Reusable step-by-step Reset Confirmation Modal */}
      {showResetModal && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                <span style={{ fontWeight: '700', letterSpacing: '0.3px' }}>Advertencia de Restablecimiento</span>
              </div>
              <button 
                onClick={() => setShowResetModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
                disabled={resetting}
              >
                <X size={20} />
              </button>
            </div>

            <div className="card-body" style={{ padding: '24px' }}>
              
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
                    lineHeight: '1.6'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', marginBottom: '6px' }}>
                      <ShieldAlert size={18} />
                      <span>¡ATENCIÓN! ACCIÓN CRÍTICA</span>
                    </div>
                    Esta acción eliminará permanentemente <strong>TODOS los registros de productos</strong> y sus <strong>movimientos históricos</strong> del almacén. Esta operación es irreversible.
                  </div>

                  <div className="form-group">
                    <label htmlFor="resetDniInput" style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.875rem' }}>
                      Ingrese DNI de Administrador para Autorizar *
                    </label>
                    <input 
                      type="text" 
                      id="resetDniInput" 
                      placeholder="Ingrese DNI (8 dígitos)" 
                      value={dni}
                      onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                      maxLength={8}
                      autoComplete="off"
                      style={{ fontSize: '0.95rem', padding: '12px' }}
                    />
                    {dniError && (
                      <span style={{ color: 'var(--danger)', fontSize: '0.825rem', marginTop: '6px', fontWeight: '600', display: 'block' }}>
                        {dniError}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
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
                    lineHeight: '1.6'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', marginBottom: '6px' }}>
                      <AlertCircle size={18} />
                      <span>CONFIRMACIÓN FINAL</span>
                    </div>
                    Se guardará el registro de restablecimiento bajo la identificación DNI: <strong>{dni}</strong>.
                    <br /><br />
                    ¿Desea proceder con el borrado completo e irreversible de la base de datos?
                  </div>

                  {resetError && (
                    <div className="message error" style={{ marginBottom: '16px' }}>
                      <AlertCircle size={16} />
                      <span>{resetError}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px' }}>
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
