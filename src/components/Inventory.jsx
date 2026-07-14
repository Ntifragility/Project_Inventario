import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { 
  RefreshCw, 
  Download, 
  AlertTriangle, 
  Search, 
  X, 
  History, 
  Layers 
} from 'lucide-react';
import * as XLSX from 'xlsx';

// CSV injection sanitization helper (SEC-4)
const sanitizeCsvCell = (val) => {
  const str = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
};

export default function Inventory() {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  // Pagination state (FUNC-2)
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Detail Modal states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchStock = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_productos_stock')
        .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad')
        .order('nombre');

      if (error) throw error;
      setStockData(data || []);
    } catch (err) {
      console.error('Error fetching stock levels:', err);
      setError('Error al cargar inventario: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  // Handle Detail Modal display
  const handleViewDetails = async (product) => {
    setSelectedProduct(product);
    setLoadingHistory(true);
    setProductHistory([]);

    try {
      const { data, error } = await supabase
        .from('movimientos')
        .select('fecha, tipo, cantidad, observaciones, usuario, key')
        .eq('producto_codigo', product.codigo)
        .order('fecha', { ascending: false });

      if (error) throw error;
      setProductHistory(data || []);
    } catch (err) {
      console.error('Error fetching product history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Export to Excel helper
  const handleExportExcel = () => {
    try {
      const dataToExport = stockData.map(p => {
        let estado = 'Normal';
        const qty = parseFloat(p.cantidad) || 0;
        const min = parseFloat(p.stockMin) || 0;

        if (qty <= 0) estado = 'Sin Stock';
        else if (qty <= min && min > 0) estado = 'Stock Bajo';

        return {
          'ID Producto': p.codigo,
          'Producto': p.nombre,
          'Cantidad': qty,
          'Unidad': p.unidad,
          'Grupo': p.grupo,
          'Stock Mín.': min,
          'Estado': estado
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Actual');
      
      // Auto-fit column widths
      const maxLens = {};
      dataToExport.forEach(row => {
        Object.entries(row).forEach(([colName, val]) => {
          const cellLen = Math.max(String(colName).length, String(val ?? '').length);
          maxLens[colName] = Math.max(maxLens[colName] || 0, cellLen);
        });
      });
      worksheet['!cols'] = Object.keys(maxLens).map(colName => ({ wch: maxLens[colName] + 3 }));

      XLSX.writeFile(workbook, `Inventario_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Excel export failed:', err);
    }
  };

  // Perform client-side searches and warning filters
  const filteredData = stockData.filter(p => {
    const cleanFilter = filterText.toLowerCase();
    const matchesQuery = 
      p.codigo?.toLowerCase().includes(cleanFilter) ||
      p.nombre?.toLowerCase().includes(cleanFilter) ||
      p.grupo?.toLowerCase().includes(cleanFilter);

    if (!matchesQuery) return false;

    if (onlyAlerts) {
      const qty = parseFloat(p.cantidad) || 0;
      const min = parseFloat(p.stockMin) || 0;
      return qty <= 0 || (qty <= min && min > 0);
    }

    return true;
  });

  // Pagination computed values (FUNC-2)
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIdx = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIdx, startIdx + rowsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, onlyAlerts]);

  return (
    <div id="inventario" className="tab-content active">
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={18} />
            <span>Control de Stock Actual</span>
          </div>
        </div>
        <div className="card-body">
          <div className="actions">
            <button className="btn btn-primary" onClick={fetchStock} disabled={loading}>
              <RefreshCw size={16} />
              <span>Actualizar Stock</span>
            </button>
            <button className="btn btn-success" onClick={handleExportExcel} disabled={stockData.length === 0}>
              <Download size={16} />
              <span>Exportar a Excel</span>
            </button>
            <button 
              className={`btn ${onlyAlerts ? 'btn-warning' : 'btn-secondary'}`} 
              onClick={() => setOnlyAlerts(!onlyAlerts)}
            >
              <AlertTriangle size={16} />
              <span>{onlyAlerts ? 'Ver Todos' : 'Solo Alertas'}</span>
            </button>
          </div>

          <div className="search-filter-group">
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Buscar por código, nombre o grupo..." 
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ flex: 1 }}
            />
            {filterText && (
              <button 
                className="btn btn-secondary" 
                onClick={() => setFilterText('')}
                style={{ padding: '8px 12px' }}
              >
                Limpiar
              </button>
            )}
          </div>

          {error && <div className="message error">{error}</div>}

          {loading ? (
            <div className="loading-container">
              <span className="spinner"></span>
              <span>Cargando inventario...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="message warning">No se encontraron productos con el filtro especificado.</div>
          ) : (
            <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID Producto</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Unidad</th>
                    <th>Grupo</th>
                    <th>Stock Mín.</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((p) => {
                    let statusClass = 'status-normal';
                    let estado = 'Normal';
                    let badgeClass = 'badge-normal';

                    const qty = parseFloat(p.cantidad) || 0;
                    const min = parseFloat(p.stockMin) || 0;

                    if (qty <= 0) {
                      statusClass = 'status-zero';
                      estado = 'Sin Stock';
                      badgeClass = 'badge-zero';
                    } else if (qty <= min && min > 0) {
                      statusClass = 'status-low';
                      estado = 'Stock Bajo';
                      badgeClass = 'badge-low';
                    }

                    return (
                      <tr key={p.codigo} className={statusClass}>
                        <td data-label="ID Producto"><strong>{p.codigo}</strong></td>
                        <td data-label="Producto"><span>{p.nombre}</span></td>
                        <td data-label="Cantidad"><strong>{p.cantidad}</strong></td>
                        <td data-label="Unidad"><span>{p.unidad}</span></td>
                        <td data-label="Grupo"><span>{p.grupo}</span></td>
                        <td data-label="Stock Mín."><span>{p.stockMin}</span></td>
                        <td data-label="Estado">
                          <span className={`badge ${badgeClass}`}>{estado}</span>
                        </td>
                        <td data-label="Acciones">
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                            onClick={() => handleViewDetails(p)}
                          >
                            <History size={12} />
                            <span>Ver Historial</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (FUNC-2) */}
            {totalPages > 1 && (
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
                  <span>Mostrando {startIdx + 1}–{Math.min(startIdx + rowsPerPage, filteredData.length)} de {filteredData.length}</span>
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
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(1)} disabled={safeCurrentPage === 1}>«</button>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}>‹</button>
                  <span style={{ padding: '4px 12px', fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>{safeCurrentPage} / {totalPages}</span>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}>›</button>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage === totalPages}>»</button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Dynamic Historial Dialog Modal */}
      {selectedProduct && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '700px', width: '90%' }}>
            <div className="card-header" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={18} style={{ color: 'var(--primary)' }} />
                <span>Kardex de {selectedProduct.codigo}</span>
              </div>
            </div>
            <div className="card-body" style={{ maxHeight: '400px', overflowY: 'auto', padding: '20px' }}>
              <div style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
                <p><strong>Producto:</strong> {selectedProduct.nombre}</p>
                <p><strong>Stock Actual:</strong> {selectedProduct.cantidad} {selectedProduct.unidad} | <strong>Min:</strong> {selectedProduct.stockMin}</p>
              </div>

              {loadingHistory ? (
                <div className="loading-container">
                  <span className="spinner"></span>
                  <span>Cargando movimientos...</span>
                </div>
              ) : productHistory.length === 0 ? (
                <div className="message warning">No hay movimientos registrados para este producto.</div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Cantidad</th>
                        <th>Responsable</th>
                        <th>Clave</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productHistory.map((m, idx) => {
                        const formattedFecha = m.fecha.split('-').reverse().join('/');
                        let typeText = m.tipo;
                        let textClass = 'text-success';

                        if (m.tipo === 'SALIDA') {
                          typeText = 'Salida';
                          textClass = 'text-danger';
                        } else if (m.tipo === 'INGRESO') {
                          typeText = 'Ingreso';
                          textClass = 'text-success';
                        } else if (m.tipo === 'AJUSTE_POSITIVO') {
                          typeText = 'Ajuste +';
                          textClass = 'text-success';
                        } else if (m.tipo === 'AJUSTE_NEGATIVO') {
                          typeText = 'Ajuste -';
                          textClass = 'text-danger';
                        }

                        return (
                          <tr key={idx}>
                            <td data-label="Fecha">{formattedFecha}</td>
                            <td data-label="Tipo" className={textClass}><strong>{typeText}</strong></td>
                            <td data-label="Cantidad">{m.cantidad}</td>
                            <td data-label="Responsable">{m.usuario}</td>
                            <td data-label="Clave"><small>{m.key || 'N/A'}</small></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 24px', background: 'var(--bg-card-header)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedProduct(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
