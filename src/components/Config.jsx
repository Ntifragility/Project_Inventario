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
          <div className="dialog-card">
            <div className="card-header" style={{ color: 'var(--danger-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                <span>⚠️ Advertencia de Restablecimiento</span>
              </div>
              <button 
                onClick={() => setShowResetModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                disabled={resetting}
              >
                <X size={20} />
              </button>
            </div>

            <div className="card-body" style={{ padding: '24px' }}>
              
              {/* Step 1: Warnings and DNI form */}
              {resetStep === 1 && (
                <div>
                  <div className="message error" style={{ lineHeight: '1.5', marginBottom: '20px' }}>
                    <strong>¡ATENCIÓN!</strong> Esta acción eliminará permanentemente TODOS los registros de productos y los movimientos en el sistema. Esta operación es irreversible.
                  </div>
                  <div className="form-group">
                    <label htmlFor="resetDniInput" style={{ fontWeight: '600' }}>
                      Ingrese DNI de Administrador para Autorizar *
                    </label>
                    <input 
                      type="text" 
                      id="resetDniInput" 
                      placeholder="Ingrese DNI (solo dígitos)" 
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      maxLength={20}
                      autoComplete="off"
                    />
                    {dniError && (
                      <span style={{ color: 'var(--danger)', fontSize: '0.825rem', marginTop: '6px', fontWeight: '500' }}>
                        {dniError}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
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
                  <div className="message warning" style={{ lineHeight: '1.5', marginBottom: '20px' }}>
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
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
                  <div className="message success" style={{ lineHeight: '1.5', marginBottom: '20px' }}>
                    <CheckCircle2 size={18} />
                    <span><strong>¡Éxito!</strong> La base de datos ha sido restablecida a su estado inicial. Todos los productos y logs de movimientos fueron eliminados de forma segura.</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
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
