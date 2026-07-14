import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { FileText, Play, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';

// CSV injection sanitization helper (SEC-4)
const sanitizeCsvCell = (val) => {
  const str = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
};

export default function Reports() {
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tipo, setTipo] = useState('');
  const [reportData, setReportData] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Pagination state (FUNC-2)
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

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
  const handleExportExcel = () => {
    if (reportData.length === 0) return;

    try {
      const dataToExport = reportData.map(m => ({
        'Fecha de mov.': m.fecha,
        'Transaction Key': m.productKey,
        'ID Producto': m.codigo,
        'Producto': m.producto,
        'Unidad': m.unidad,
        'Cantidad': parseFloat(m.cantidad) || 0,
        'Tipo': m.tipo,
        'Observaciones': m.observaciones || '',
        'Usuario': m.usuario
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');

      // Auto-fit column widths
      const maxLens = {};
      dataToExport.forEach(row => {
        Object.entries(row).forEach(([colName, val]) => {
          const cellLen = Math.max(String(colName).length, String(val ?? '').length);
          maxLens[colName] = Math.max(maxLens[colName] || 0, cellLen);
        });
      });
      worksheet['!cols'] = Object.keys(maxLens).map(colName => ({ wch: maxLens[colName] + 3 }));

      XLSX.writeFile(workbook, `Reporte_Movimientos_${fechaDesde}_${fechaHasta}.xlsx`);
    } catch (err) {
      console.error('Error exporting report to Excel:', err);
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
              onClick={handleExportExcel} 
              disabled={reportData.length === 0 || loading}
            >
              <Download size={16} />
              <span>Exportar a Excel</span>
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
            <>
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
                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(reportData.length / rowsPerPage));
                    const safePage = Math.min(currentPage, totalPages);
                    const startIdx = (safePage - 1) * rowsPerPage;
                    const pageData = reportData.slice(startIdx, startIdx + rowsPerPage);
                    return pageData.map((m, idx) => {
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
                  });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (FUNC-2) */}
            {(() => {
              const totalPages = Math.max(1, Math.ceil(reportData.length / rowsPerPage));
              const safePage = Math.min(currentPage, totalPages);
              const startIdx = (safePage - 1) * rowsPerPage;
              if (totalPages <= 1) return null;
              return (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginTop: '16px',
                  padding: '12px 0',
                  borderTop: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>Mostrando {startIdx + 1}–{Math.min(startIdx + rowsPerPage, reportData.length)} de {reportData.length}</span>
                    <select 
                      value={rowsPerPage} 
                      onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                    >
                      <option value={25}>25 filas</option>
                      <option value={50}>50 filas</option>
                      <option value={100}>100 filas</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
                    <span style={{ padding: '4px 12px', fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>{safePage} / {totalPages}</span>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>»</button>
                  </div>
                </div>
              );
            })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
