import React, { useState } from 'react';
import { supabase } from '../supabase';
import { KeyRound, Mail, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage(err.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <h2>Ingreso al Sistema</h2>
          <p>OT E&I - Materiales</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label htmlFor="loginEmail" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={16} style={{ color: 'var(--primary)' }} />
              <span>Correo Electrónico</span>
            </label>
            <input 
              type="email" 
              id="loginEmail" 
              placeholder="correo@ejemplo.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label htmlFor="loginPassword" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={16} style={{ color: 'var(--primary)' }} />
              <span>Contraseña</span>
            </label>
            <input 
              type="password" 
              id="loginPassword" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginBottom: 0 }}></span>
                <span>Ingresando...</span>
              </div>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        {errorMessage && (
          <div className="message error">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
