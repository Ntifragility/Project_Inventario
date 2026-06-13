import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { FileText, Play, Download, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Reports() {
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tipo, setTipo] = useState('');
  const [reportData, setReportData] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Set default date range on mount
  useEffect(() => {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    setFechaDesde(monthAgo.toISOString().slice(0, 10));
    setFechaHasta(today.toISOString().slice(0, 10));
  }, []);

  // Run database query
  const handleGenerateReport = async () => {
    if (!fechaDesde || !fechaHasta) {
      setError('Seleccione ambas fechas para realizar la consulta.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      let query = supabase
        .from('movimientos')
        .select(`
          fecha,
          codigo:producto_codigo,
          cantidad,
          observaciones,
          usuario,
          tipo,
          key,
          producto:productos(nombre, unidades(nombre))
        `)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha', { ascending: false });

      if (tipo) {
        query = query.eq('tipo', tipo);
      }

      const { data, error: queryErr } = await query;
      if (queryErr) throw queryErr;

      const formatted = (data || []).map(m => ({
        fecha: m.fecha.split('-').reverse().join('/'),
        fechaRaw: m.fecha,
        productKey: m.key || '',
        codigo: m.codigo,
        producto: m.producto ? m.producto.nombre : 'Producto no encontrado',
        unidad: m.producto && m.producto.unidades ? m.producto.unidades.nombre : '',
        tipo: m.tipo,
        cantidad: parseFloat(m.cantidad) || 0,
        observaciones: m.observaciones || '',
        usuario: m.usuario
      }));

      setReportData(formatted);
      if (formatted.length === 0) {
        setMessage('No se encontraron movimientos en el período seleccionado.');
      }
    } catch (err) {
      console.error('Error generating report:', err);
      setError('Error al generar el reporte: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export report logic
  const handleExportCSV = () => {
    if (reportData.length === 0) return;

    try {
      let csv = "\uFEFF"; // BOM
      csv += "Fecha de mov.,Transaction Key,ID Producto,Producto,Unidad,Cantidad,Tipo,Observaciones,Usuario\n";

      reportData.forEach(m => {
        csv += `"${m.fecha}","${m.productKey}","${m.codigo}","${m.producto}","${m.unidad}",${m.cantidad},"${m.tipo}","${m.observaciones}","${m.usuario}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Reporte_Movimientos_${fechaDesde}_${fechaHasta}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting report to CSV:', err);
    }
  };

  return (
    <div id="reportes" className="tab-content active">
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} />
            <span>Historial y Reportes de Movimientos</span>
          </div>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="fechaDesde">Fecha Desde</label>
              <input 
                type="date" 
                id="fechaDesde" 
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="fechaHasta">Fecha Hasta</label>
              <input 
                type="date" 
                id="fechaHasta" 
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="filtroTipo">Filtrar por Tipo</label>
              <select 
                id="filtroTipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="">Todos los movimientos</option>
                <option value="INGRESO">Solo Ingresos</option>
                <option value="SALIDA">Solo Salidas</option>
                <option value="AJUSTE_POSITIVO">Solo Ajustes Positivos</option>
                <option value="AJUSTE_NEGATIVO">Solo Ajustes Negativos</option>
              </select>
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={handleGenerateReport} disabled={loading}>
              <Play size={16} />
              <span>Generar Reporte</span>
            </button>
            <button 
              className="btn btn-success" 
              onClick={handleExportCSV} 
              disabled={reportData.length === 0 || loading}
            >
              <Download size={16} />
              <span>Exportar Reporte</span>
            </button>
          </div>

          {error && (
            <div className="message error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="message warning">
              <AlertCircle size={16} />
              <span>{message}</span>
            </div>
          )}

          {loading ? (
            <div className="loading-container">
              <span className="spinner"></span>
              <span>Generando reporte de movimientos...</span>
            </div>
          ) : reportData.length > 0 && (
            <div className="table-container" style={{ marginTop: '20px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Transaction Key</th>
                    <th>ID Producto</th>
                    <th>Producto</th>
                    <th>Unidad</th>
                    <th>Cantidad</th>
                    <th>Tipo</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((m, idx) => {
                    let tipoClass = 'text-success';
                    let tipoText = m.tipo;
                    
                    switch(m.tipo) {
                      case 'INGRESO':
                        tipoClass = 'text-success';
                        tipoText = 'Ingreso';
                        break;
                      case 'SALIDA':
                        tipoClass = 'text-danger';
                        tipoText = 'Salida';
                        break;
                      case 'AJUSTE_POSITIVO':
                        tipoClass = 'text-success';
                        tipoText = 'Ajuste +';
                        break;
                      case 'AJUSTE_NEGATIVO':
                        tipoClass = 'text-danger';
                        tipoText = 'Ajuste -';
                        break;
                      default:
                        tipoClass = 'text-info';
                    }

                    return (
                      <tr key={idx}>
                        <td>{m.fecha}</td>
                        <td><small>{m.productKey}</small></td>
                        <td><strong>{m.codigo}</strong></td>
                        <td>{m.producto}</td>
                        <td>{m.unidad}</td>
                        <td>{m.cantidad}</td>
                        <td className={tipoClass}><strong>{tipoText}</strong></td>
                        <td><small>{m.observaciones}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
