import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useProjectArea } from '../contexts/ProjectAreaContext';
import { 
  Package, 
  RefreshCw, 
  AlertTriangle, 
  Activity, 
  ShieldAlert, 
  ShieldCheck 
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function Dashboard() {
  const { activeAreaId } = useProjectArea();
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

  // Chart data states (FUNC-8)
  const [trendData, setTrendData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  const fetchStats = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [resProductos, resMovimientos, resStock] = await Promise.all([
        supabase.from('productos').select('*', { count: 'exact', head: true }),
        supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('project_area_id', activeAreaId),
        supabase.from('v_productos_stock').select('codigo, nombre, stockMin:stock_min, cantidad').eq('project_area_id', activeAreaId)
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

      // Fetch chart data (FUNC-8)
      await fetchChartData();
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
      setError('Error al cargar estadísticas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [activeAreaId]);

  const fetchChartData = async () => {
    try {
      // Get movements from last 30 days for trend chart
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const fromDate = thirtyDaysAgo.toISOString().slice(0, 10);

      const { data: recentMoves, error: movErr } = await supabase
        .from('movimientos')
        .select('producto_codigo, fecha, tipo, cantidad')
        .eq('project_area_id', activeAreaId)
        .gte('fecha', fromDate)
        .order('fecha');

      if (movErr) throw movErr;

      // Aggregate by date
      const dateMap = new Map();
      (recentMoves || []).forEach(m => {
        const key = m.fecha;
        if (!dateMap.has(key)) {
          dateMap.set(key, { fecha: key, ingresos: 0, salidas: 0 });
        }
        const entry = dateMap.get(key);
        if (m.tipo === 'INGRESO' || m.tipo === 'AJUSTE_POSITIVO') {
          entry.ingresos += parseFloat(m.cantidad) || 0;
        } else if (m.tipo === 'SALIDA' || m.tipo === 'AJUSTE_NEGATIVO') {
          entry.salidas += parseFloat(m.cantidad) || 0;
        }
      });

      const trend = Array.from(dateMap.values())
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map(d => ({
          ...d,
          fecha: d.fecha.split('-').slice(1).join('/'), // MM/DD format
          ingresos: Math.round(d.ingresos * 100) / 100,
          salidas: Math.round(d.salidas * 100) / 100
        }));
      setTrendData(trend);

      // Top 5 most moved products
      const productMap = new Map();
      (recentMoves || []).forEach(m => {
        const code = m.producto_codigo || 'N/A';
        const current = productMap.get(code) || 0;
        productMap.set(code, current + (parseFloat(m.cantidad) || 0));
      });

      const top = Array.from(productMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([codigo, total]) => ({ codigo, total: Math.round(total * 100) / 100 }));
      setTopProducts(top);

    } catch (err) {
      console.error('Error loading chart data:', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Custom tooltip style for charts
  const CustomTooltipStyle = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '0.8rem',
    color: 'var(--text-primary)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
  };

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

      {/* Charts Section (FUNC-8) */}
      {trendData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={18} />
              <span>Movimientos — Últimos 30 Días</span>
            </div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip contentStyle={CustomTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                <Line type="monotone" dataKey="ingresos" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Ingresos" />
                <Line type="monotone" dataKey="salidas" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Salidas" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {topProducts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={18} />
              <span>Top 5 Productos Más Movidos (30 días)</span>
            </div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis dataKey="codigo" type="category" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={100} />
                <Tooltip contentStyle={CustomTooltipStyle} />
                <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Cantidad Total" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
