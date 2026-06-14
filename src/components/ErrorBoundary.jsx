import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100vh',
          background: 'var(--bg-app)',
          padding: '24px'
        }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
            <div className="card-body" style={{ padding: '40px 32px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px auto'
              }}>
                <AlertTriangle size={28} style={{ color: 'var(--danger)' }} />
              </div>

              <h2 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '700', 
                color: 'var(--text-primary)', 
                marginBottom: '12px' 
              }}>
                Error Inesperado
              </h2>

              <p style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '0.9rem', 
                lineHeight: '1.6',
                marginBottom: '8px' 
              }}>
                Ha ocurrido un error inesperado en la aplicación. Puede intentar recargar la página o continuar trabajando.
              </p>

              {this.state.error && (
                <div className="message error" style={{ 
                  marginTop: '16px',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  wordBreak: 'break-word'
                }}>
                  <span>{this.state.error.toString()}</span>
                </div>
              )}

              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'center', 
                marginTop: '24px' 
              }}>
                <button className="btn btn-primary" onClick={this.handleReload}>
                  <RefreshCw size={16} />
                  <span>Recargar Página</span>
                </button>
                <button className="btn btn-secondary" onClick={this.handleDismiss}>
                  <span>Intentar Continuar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
