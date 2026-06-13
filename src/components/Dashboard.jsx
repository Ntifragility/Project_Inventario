import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { 
  Package, 
  RefreshCw, 
  AlertTriangle, 
  Activity, 
  ShieldAlert, 
  ShieldCheck 
} from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProductos: 0,
    totalMovimientos: 0,
    sinStock: 0,
    stockBajo: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alertProducts, setAlertProducts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);

  const fetchStats = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [resProductos, resMovimientos, resStock] = await Promise.all([
        supabase.from('productos').select('*', { count: 'exact', head: true }),
        supabase.from('movimientos').select('*', { count: 'exact', head: true }),
        supabase.from('v_productos_stock').select('codigo, nombre, stockMin:stock_min, cantidad')
      ]);

      if (resProductos.error) throw resProductos.error;
      if (resMovimientos.error) throw resMovimientos.error;
      if (resStock.error) throw resStock.error;

      let sinStock = 0;
      let stockBajo = 0;
      const alerts = [];

      resStock.data.forEach(p => {
        const cantidad = parseFloat(p.cantidad) || 0;
        const stockMin = parseFloat(p.stockMin) || 0;

        if (cantidad <= 0) {
          sinStock++;
          alerts.push({ ...p, estado: 'Sin Stock', statusClass: 'status-zero' });
        } else if (cantidad <= stockMin && stockMin > 0) {
          stockBajo++;
          alerts.push({ ...p, estado: 'Stock Bajo', statusClass: 'status-low' });
        }
      });

      setStats({
        totalProductos: resProductos.count || 0,
        totalMovimientos: resMovimientos.count || 0,
        sinStock,
        stockBajo
      });

      setAlertProducts(alerts);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
      setError('Error al cargar estadísticas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div id="dashboard" className="tab-content active">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Package size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-value">{stats.totalProductos}</span>
            <span className="stat-label">Total Productos</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Activity size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-value">{stats.totalMovimientos}</span>
            <span className="stat-label">Total Movimientos</span>
          </div>
        </div>

        <div className="stat-card stat-danger">
          <div className="stat-icon-wrapper">
            <ShieldAlert size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-value">{stats.sinStock}</span>
            <span className="stat-label">Sin Stock</span>
          </div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-icon-wrapper">
            <AlertTriangle size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-value">{stats.stockBajo}</span>
            <span className="stat-label">Stock Bajo</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>Alertas & Controles del Dashboard</span>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', marginBottom: 0 }}></span>
              <span>Cargando...</span>
            </div>
          )}
        </div>
        <div className="card-body">
          <div className="actions">
            <button className="btn btn-primary" onClick={fetchStats} disabled={loading}>
              <RefreshCw size={16} />
              <span>Actualizar Dashboard</span>
            </button>
            <button 
              className="btn btn-warning" 
              onClick={() => setShowAlerts(!showAlerts)}
            >
              <AlertTriangle size={16} />
              <span>{showAlerts ? 'Ocultar Alertas' : 'Ver Alertas de Stock'}</span>
            </button>
          </div>

          {error && <div className="message error">{error}</div>}

          {showAlerts && (
            <div id="alertsContainer" style={{ marginTop: '20px' }}>
              {alertProducts.length === 0 ? (
                <div className="message success">
                  <ShieldCheck size={18} />
                  <span>No hay productos con alertas de stock. ¡Todo el inventario está en buen estado!</span>
                </div>
              ) : (
                <>
                  <div className="message warning" style={{ marginBottom: '16px' }}>
                    <ShieldAlert size={18} />
                    <span>Hay <strong>{alertProducts.length}</strong> producto(s) que requieren atención inmediata.</span>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Nombre</th>
                          <th>Stock Actual</th>
                          <th>Stock Mín.</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertProducts.map((p) => (
                          <tr key={p.codigo} className={p.statusClass}>
                            <td><strong>{p.codigo}</strong></td>
                            <td>{p.nombre}</td>
                            <td>{p.cantidad}</td>
                            <td>{p.stockMin}</td>
                            <td>
                              <span className={`badge ${p.cantidad <= 0 ? 'badge-zero' : 'badge-low'}`}>
                                {p.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
