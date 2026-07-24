import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { Layers, Search, RefreshCw, Upload, AlertCircle, Download, Activity } from 'lucide-react';
import ConsumptionImport from './ConsumptionImport';

export default function ConsumptionReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('v_balance_consumos')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setData(data || []);
    } catch (err) {
      console.error('Error fetching balance:', err);
      setError('Error al cargar reporte: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const filteredData = data.filter(r => {
    const cleanFilter = filterText.toLowerCase().trim();
    if (!cleanFilter) return true;

    if (cleanFilter.includes('*')) {
      const regexStr = cleanFilter
        .split('*')
        .map(part => part.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')) // REMOVED trim() so spaces are respected!
        .join('.*');
      try {
        const regex = new RegExp(regexStr, 'i');
        return (
          regex.test(r.codigo || '') ||
          regex.test(r.nombre || '') ||
          regex.test(r.grupo || '')
        );
      } catch (e) {
        return false;
      }
    }

    // Smart search: every word must match somewhere
    const searchTerms = cleanFilter.split(/\s+/);
    return searchTerms.every(term => 
      (r.codigo || '').toLowerCase().includes(term) ||
      (r.nombre || '').toLowerCase().includes(term) ||
      (r.grupo || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="tab-content active">
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={18} />
            <span>Balance General y Reportes de Stock</span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={() => setShowImport(true)}>
              <Upload size={16} />
              <span>Importar Consumo</span>
            </button>
            <button className="btn btn-secondary" onClick={fetchReport} disabled={loading}>
              <RefreshCw size={16} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>
        
        <div className="card-body">
          <div className="search-filter-group" style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ color: 'var(--text-muted)', position: 'absolute', left: '12px' }} />
              <input 
                type="text" 
                placeholder="Buscar por código, nombre o grupo (Use * como comodín o palabras separadas por espacio)..." 
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                style={{ width: '100%', paddingLeft: '38px', height: '40px' }}
              />
            </div>
            <button 
              className="btn btn-success" 
              onClick={() => {
                import('xlsx').then(XLSX => {
                  const dataToExport = filteredData.map(r => ({
                    'ID Producto': r.codigo,
                    'Producto': r.nombre,
                    'Grupo': r.grupo,
                    'U.M.': r.unidad,
                    'Metrado OT': r.total_metrado_ot || 0,
                    'Cant. OC': r.total_cant_oc || 0,
                    'Ingresó (Almacén)': r.total_ingreso,
                    'Salió (A Campo)': r.total_salida,
                    'Stock (Almacén)': r.stock_almacen,
                    'Instalado (Campo)': r.total_consumo,
                    'Faltante (Brecha)': r.brecha,
                    '% Faltante': r.porcentaje_brecha
                  }));
                  const ws = XLSX.utils.json_to_sheet(dataToExport);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Balance');
                  XLSX.writeFile(wb, `Balance_Consumos_${new Date().toISOString().slice(0, 10)}.xlsx`);
                });
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px', whiteSpace: 'nowrap' }}
              title="Exportar a Excel"
            >
              <Download size={16} />
              <span>Exportar Excel ({filteredData.length})</span>
            </button>
          </div>

          {error && <div className="message error" style={{ marginBottom: '16px' }}>{error}</div>}

          {loading ? (
            <div className="loading-container" style={{ padding: '40px' }}>
              <span className="spinner"></span>
              <span>Cargando datos...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="message warning">No hay datos para mostrar.</div>
          ) : (
            <div className="table-container">
              <table style={{ minWidth: '1300px' }}>
                <thead>
                  <tr>
                    <th>ID Producto</th>
                    <th>Producto</th>
                    <th>Grupo</th>
                    <th>U.M.</th>
                    <th style={{ textAlign: 'right' }}>Metrado OT</th>
                    <th style={{ textAlign: 'right' }}>Cant. OC</th>
                    <th style={{ textAlign: 'right' }}>Ingresó (Almacén)</th>
                    <th style={{ textAlign: 'right' }}>Salió (A Campo)</th>
                    <th style={{ textAlign: 'right' }}>Stock (Almacén)</th>
                    <th style={{ textAlign: 'right' }}>Instalado (Campo)</th>
                    <th style={{ textAlign: 'right' }}>Faltante (Brecha)</th>
                    <th style={{ textAlign: 'right' }}>% Faltante</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map(row => {
                    const brecha = parseFloat(row.brecha) || 0;
                    let brechaClass = 'text-normal';
                    if (brecha > 0) brechaClass = 'text-warning'; 
                    if (brecha < 0) brechaClass = 'text-danger';  
                    if (brecha === 0 && row.total_salida > 0) brechaClass = 'text-success'; 

                    // Estado logic based on stock_min
                    let statusClass = 'status-normal';
                    let estado = 'Normal';
                    let badgeClass = 'badge-normal';

                    const qty = parseFloat(row.stock_almacen) || 0;
                    const min = parseFloat(row.stock_min) || 0;

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
                      <tr key={row.codigo} className={statusClass}>
                        <td data-label="ID Producto"><strong>{row.codigo}</strong></td>
                        <td data-label="Producto"><span>{row.nombre}</span></td>
                        <td data-label="Grupo"><span>{row.grupo || '-'}</span></td>
                        <td data-label="U.M."><span>{row.unidad}</span></td>
                        <td data-label="Metrado OT" style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>{row.total_metrado_ot || 0}</td>
                        <td data-label="Cant. OC" style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 'bold' }}>{row.total_cant_oc || 0}</td>
                        <td data-label="Ingresó" style={{ textAlign: 'right' }}>{row.total_ingreso}</td>
                        <td data-label="Salió" style={{ textAlign: 'right' }}>{row.total_salida}</td>
                        <td data-label="Stock" style={{ textAlign: 'right', fontWeight: 'bold' }}>{row.stock_almacen}</td>
                        <td data-label="Instalado" style={{ textAlign: 'right' }}>{row.total_consumo}</td>
                        <td data-label="Faltante" style={{ textAlign: 'right' }}>
                          <strong className={brechaClass}>
                            {brecha > 0 && <AlertCircle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />}
                            {brecha}
                          </strong>
                        </td>
                        <td data-label="% Faltante" style={{ textAlign: 'right' }}>
                          <span className={brechaClass}>{row.porcentaje_brecha}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ConsumptionImport 
          onClose={() => setShowImport(false)} 
          onImportComplete={() => {
            setShowImport(false);
            fetchReport();
          }}
        />
      )}
    </div>
  );
}
