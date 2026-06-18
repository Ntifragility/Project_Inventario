import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertTriangle } from 'lucide-react';

export default function BarcodeScanner({ onClose, onScanSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    const scannerId = 'barcode-scanner-reader';

    // Small delay to ensure container element is rendered in DOM
    const initTimeout = setTimeout(() => {
      const html5QrCode = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (width, height) => {
          // Adjust scanning box dynamically based on view size
          const size = Math.min(width, height) * 0.65;
          return { width: size, height: size * 0.6 }; // Wider rectangular box for 1D barcodes
        },
        aspectRatio: 1.0
      };

      html5QrCode.start(
        { facingMode: 'environment' }, // Directs to back camera on mobile
        config,
        (decodedText) => {
          // Successfully scanned code!
          onScanSuccess(decodedText);
          cleanupScanner();
          onClose();
        },
        (errorMessage) => {
          // Silent callback, html5-qrcode scans frame-by-frame and emits noisy warnings if barcode not detected in frame
        }
      )
      .then(() => {
        setIsInitializing(false);
      })
      .catch((err) => {
        console.error('Error starting html5-qrcode scanner:', err);
        setIsInitializing(false);
        setErrorMsg('No se pudo acceder a la cámara. Verifique que los permisos estén habilitados.');
      });
    }, 300);

    return () => {
      clearTimeout(initTimeout);
      cleanupScanner();
    };
  }, [onScanSuccess, onClose]);

  const cleanupScanner = () => {
    const instance = html5QrCodeRef.current;
    if (instance) {
      if (instance.isScanning) {
        instance.stop()
          .then(() => {
            try {
              instance.clear();
            } catch(e) {
              console.warn('Error clearing scanner canvas:', e);
            }
          })
          .catch((err) => console.error('Error stopping scanner during cleanup:', err));
      }
      html5QrCodeRef.current = null;
    }
  };

  return (
    <div className="dialog-overlay barcode-scanner-overlay">
      <div className="dialog-card barcode-scanner-card">
        <div className="card-header barcode-scanner-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} />
            <span>Escanear Código de Barras / QR</span>
          </div>
        </div>

        <div className="card-body scanner-body">
          {errorMsg ? (
            <div className="message error" style={{ margin: 0, justifyContent: 'center', flexDirection: 'column', padding: '24px' }}>
              <AlertTriangle size={36} style={{ marginBottom: '12px' }} />
              <span style={{ textAlign: 'center', fontWeight: '500' }}>{errorMsg}</span>
            </div>
          ) : (
            <div className="scanner-container">
              {isInitializing && (
                <div className="scanner-loader">
                  <span className="spinner"></span>
                  <span>Iniciando cámara...</span>
                </div>
              )}
              <div id="barcode-scanner-reader" ref={scannerRef}></div>
              
              {!isInitializing && (
                <div className="scanner-guideline-box">
                  <div className="scanner-line"></div>
                  <p className="scanner-instructions">Alinee el código de barras o QR dentro del cuadro para escanear</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="card-footer scanner-footer">
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%' }}
            onClick={() => {
              cleanupScanner();
              onClose();
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
