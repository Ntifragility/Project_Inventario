import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import {
  Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ArrowUpDown, Package, Filter, FilterX
} from 'lucide-react';

export default function CableTable({ filterArea = '', filterTipoServicio = '', filterTipoCable = '' }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('tag_unico');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedRow, setExpandedRow] = useState(null);
  const [despachos, setDespachos] = useState([]);
  const [loadingDespachos, setLoadingDespachos] = useState(false);
  
  // Excel-like filter state
  const [headerFilters, setHeaderFilters] = useState({});
  const [activeFilter, setActiveFilter] = useState(null);

  const COLUMNS = filterTipoCable === 'PAT' ? [
    { field: 'tag_unico', label: 'TAG UNICO', width: '144px' },
    { field: 'wbs', label: 'WBS', width: '60px' },
    { field: 'sistema', label: 'Sistema', width: '252px' },
    { field: 'plano', label: 'Plano', width: '150px' },
    { field: 'material', label: 'Descripción de Cable', width: '200px' },
    { field: 'total_estimado_m', label: 'Metrado OT (m)', width: '120px', align: 'right' },
    { field: 'metrado_reportado_campo', label: 'Metrado Campo (m)', width: '104px', align: 'right' },
    { field: 'avance', label: '% Avance', width: '100px', align: 'center', computed: true },
    { field: 'fecha_tendido', label: 'Fecha Metrado Campo', width: '120px', align: 'center' },
  ] : [
    { field: 'tag_unico', label: 'TAG UNICO', width: '180px' },
    { field: 'area', label: 'Área', width: '100px' },
    { field: 'tipo_cable', label: 'Tipo Cable', width: '180px' },
    { field: 'total_estimado_m', label: 'Long. Diseño (m)', width: '120px', align: 'right' },
    { field: 'metrado_reportado_campo', label: 'Metrado Campo (m)', width: '130px', align: 'right' },
    { field: 'avance', label: '% Avance', width: '100px', align: 'center', computed: true },
    { field: 'estado', label: 'Estado', width: '120px', align: 'center' },
    { field: 'conexion_origen', label: 'Conex. Origen', width: '150px' },
    { field: 'conexion_destino', label: 'Conex. Destino', width: '150px' },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('cable_schedule').select('*');
      if (filterArea) query = query.eq('area', filterArea);
      if (filterTipoServicio) query = query.eq('tipo_servicio', filterTipoServicio);
      if (filterTipoCable) query = query.eq('tipo_cable', filterTipoCable);
      if (search.trim()) {
        const searchTerm = search.trim().replace(/\*/g, '%');
        query = query.or(`tag_unico.ilike.%${searchTerm}%,tipo_cable.ilike.%${searchTerm}%,area.ilike.%${searchTerm}%,wbs.ilike.%${searchTerm}%,plano.ilike.%${searchTerm}%`);
      }
      query = query.order(sortField, { ascending: sortDir === 'asc' });

      const { data: rows, error } = await query;
      if (error) throw error;
      setData(rows || []);
    } catch (err) {
      console.error('Cable table fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterArea, filterTipoServicio, filterTipoCable, search, sortField, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchDespachos = useCallback(async (tagUnico) => {
    setLoadingDespachos(true);
    try {
      const { data: desp, error } = await supabase
        .from('cable_despachos')
        .select('*')
        .eq('tag_unico', tagUnico)
        .order('fecha_entrega', { ascending: false });

      if (error) throw error;
      setDespachos(desp || []);
    } catch (err) {
      console.error('Despachos fetch error:', err);
      setDespachos([]);
    } finally {
      setLoadingDespachos(false);
    }
  }, []);

  const toggleExpand = (tagUnico) => {
    if (filterTipoCable === 'PAT') return;
    if (expandedRow === tagUnico) {
      setExpandedRow(null);
      setDespachos([]);
    } else {
      setExpandedRow(tagUnico);
      fetchDespachos(tagUnico);
    }
  };

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getAvance = (row) => {
    const total = parseFloat(row.total_estimado_m) || 0;
    const metrado = parseFloat(row.metrado_reportado_campo) || 0;
    if (total <= 0) return 0;
    return Math.min(100, (metrado / total) * 100);
  };

  const getEstadoBadge = (estado) => {
    const classes = {
      'Por Tender': 'status-badge status-pending',
      'Tendido': 'status-badge status-tendido',
      'Conexion Origen': 'status-badge status-conexion',
      'Conexion Destino': 'status-badge status-conexion',
      'Precomisionado': 'status-badge status-precomisionado'
    };
    const c = classes[estado] || 'status-badge';
    return <span className={c}>{estado || '—'}</span>;
  };

  // --- Excel-like Filter Logic ---
  const [tempFilters, setTempFilters] = useState([]);
  const [filterSearch, setFilterSearch] = useState('');

  const getUniqueValues = (field) => {
    const vals = data.map(r => (r[field] || '—').toString());
    return [...new Set(vals)].sort();
  };

  const openFilter = (field) => {
    setActiveFilter(field);
    setFilterSearch('');
    const current = headerFilters[field];
    if (!current) {
      setTempFilters(getUniqueValues(field));
    } else {
      setTempFilters([...current]);
    }
  };

  const applyFilter = (field) => {
    const allVals = getUniqueValues(field);
    if (tempFilters.length === allVals.length) {
      setHeaderFilters(prev => ({ ...prev, [field]: undefined }));
    } else {
      setHeaderFilters(prev => ({ ...prev, [field]: tempFilters }));
    }
    setActiveFilter(null);
  };

  const filteredData = data.filter(row => {
    return Object.entries(headerFilters).every(([key, selectedValues]) => {
      if (!selectedValues) return true;
      const cellValue = (row[key] || '—').toString();
      return selectedValues.includes(cellValue);
    });
  });

  return (
    <div className="cable-table-container">
      <div className="cable-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 12 }}>
        <div className="cable-search" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <Search size={16} style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Buscar por TAG, WBS, Sistema..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {Object.keys(headerFilters).length > 0 && (
            <button 
              title="Limpiar todos los filtros"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 8px', display: 'flex', alignItems: 'center' }}
              onClick={() => setHeaderFilters({})}
            >
              <FilterX size={16} />
            </button>
          )}
        </div>
        <div className="cable-count text-muted" style={{ whiteSpace: 'nowrap' }}>
          {filteredData.length} circuitos encontrados
        </div>
      </div>

      <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
        <table className="cable-table" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              {COLUMNS.map(col => {
                const isFilterActive = activeFilter === col.field;
                const allVals = isFilterActive ? getUniqueValues(col.field) : [];
                const searchVals = isFilterActive ? allVals.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase())) : [];
                const isAllSelected = isFilterActive && searchVals.length > 0 && searchVals.every(v => tempFilters.includes(v));

                return (
                  <th
                    key={col.field}
                    style={{ width: col.width, textAlign: col.align || 'left', position: 'relative' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'space-between' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: col.computed ? 'default' : 'pointer' }}
                        onClick={() => !col.computed && handleSort(col.field)}
                      >
                        {col.label}
                        {!col.computed && sortField === col.field && (
                          <ArrowUpDown size={12} className={sortDir === 'desc' ? 'flipped' : ''} />
                        )}
                      </div>
                      {!col.computed && (
                        <div style={{ position: 'relative', marginLeft: 'auto', paddingLeft: 8 }}>
                          <button
                            style={{
                              background: headerFilters[col.field] ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                              border: '1px solid ' + (headerFilters[col.field] ? '#3b82f6' : 'rgba(255,255,255,0.1)'),
                              cursor: 'pointer', borderRadius: 4, padding: 2, display: 'flex'
                            }}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (activeFilter === col.field) setActiveFilter(null);
                              else openFilter(col.field);
                            }}
                          >
                            {headerFilters[col.field] ? (
                               <Filter size={12} color="#3b82f6" />
                            ) : (
                               <ChevronDown size={12} color="currentColor" />
                            )}
                          </button>
                          
                          {activeFilter === col.field && (
                            <div
                              style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-card)', 
                                border: '1px solid var(--border-color)', borderRadius: 6, padding: 0, zIndex: 9999,
                                width: 182, boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                textAlign: 'left', fontWeight: 'normal', color: 'var(--text-primary)',
                                display: 'flex', flexDirection: 'column'
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>
                                 <input 
                                   type="text" 
                                   placeholder="Buscar..." 
                                   value={filterSearch}
                                   onChange={e => setFilterSearch(e.target.value)}
                                   style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'white', boxSizing: 'border-box' }}
                                   autoFocus
                                 />
                              </div>
                              <div style={{ padding: '6px 10px', maxHeight: 220, overflowY: 'auto' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', cursor: 'pointer', margin: 0, padding: '3px 0', fontWeight: 'bold' }}>
                                  <input
                                    type="checkbox"
                                    style={{ flexShrink: 0, width: 14, height: 14 }}
                                    checked={isAllSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        const newFilters = new Set(tempFilters);
                                        searchVals.forEach(v => newFilters.add(v));
                                        setTempFilters([...newFilters]);
                                      } else {
                                        setTempFilters(tempFilters.filter(v => !searchVals.includes(v)));
                                      }
                                    }}
                                  />
                                  (Seleccionar todo)
                                </label>
                                {searchVals.map(val => (
                                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', cursor: 'pointer', margin: 0, padding: '3px 0' }}>
                                    <input
                                      type="checkbox"
                                      style={{ flexShrink: 0, width: 14, height: 14 }}
                                      checked={tempFilters.includes(val)}
                                      onChange={(e) => {
                                        if (e.target.checked) setTempFilters([...tempFilters, val]);
                                        else setTempFilters(tempFilters.filter(v => v !== val));
                                      }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                                  </label>
                                ))}
                              </div>
                              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'rgba(0,0,0,0.1)' }}>
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  onClick={() => setActiveFilter(null)}
                                >Cancelar</button>
                                <button 
                                  className="btn btn-primary btn-sm" 
                                  onClick={() => applyFilter(col.field)}
                                >Aceptar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="cable-table-loading">
                  Cargando...
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="cable-table-empty">
                  No se encontraron circuitos.
                </td>
              </tr>
            ) : (
              filteredData.map((row) => {
                const isExpanded = expandedRow === row.tag_unico;
                const avance = getAvance(row);

                return (
                  <React.Fragment key={row.tag_unico}>
                    <tr
                      className={`cable-table-row ${isExpanded ? 'expanded' : ''} ${filterTipoCable !== 'PAT' ? 'clickable' : ''}`}
                      onClick={() => filterTipoCable !== 'PAT' && toggleExpand(row.tag_unico)}
                      style={{ cursor: filterTipoCable === 'PAT' ? 'default' : 'pointer' }}
                    >
                      <td className="cable-expand-cell">
                        {filterTipoCable !== 'PAT' ? (isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null}
                      </td>
                      <td className="cable-tag-cell">{row.tag_unico}</td>
                      {filterTipoCable === 'PAT' ? (
                        <>
                          <td>{row.wbs || '—'}</td>
                          <td>{row.sistema || '—'}</td>
                          <td>{row.plano || '—'}</td>
                          <td>{row.material || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.total_estimado_m || 0).toFixed(1)}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.metrado_reportado_campo || 0).toFixed(1)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="cable-avance-bar">
                              <div
                                className="cable-avance-fill"
                                style={{
                                  width: `${avance}%`,
                                  background: avance >= 100 ? '#10b981' : avance > 50 ? '#f59e0b' : '#ef4444',
                                }}
                              />
                              <span className="cable-avance-text">{avance.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{row.fecha_tendido || '—'}</td>
                        </>
                      ) : (
                        <>
                          <td>{row.area || '—'}</td>
                          <td>{row.tipo_cable || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.total_estimado_m || 0).toFixed(1)}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.metrado_reportado_campo || 0).toFixed(1)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="cable-avance-bar">
                              <div
                                className="cable-avance-fill"
                                style={{
                                  width: `${avance}%`,
                                  background: avance >= 100 ? '#10b981' : avance > 50 ? '#f59e0b' : '#ef4444',
                                }}
                              />
                              <span className="cable-avance-text">{avance.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{getEstadoBadge(row.estado)}</td>
                          <td>{row.conexion_origen || '—'}</td>
                          <td>{row.conexion_destino || '—'}</td>
                        </>
                      )}
                    </tr>

                    {isExpanded && filterTipoCable !== 'PAT' && (
                      <tr className="cable-despacho-row">
                        <td colSpan={COLUMNS.length + 1}>
                          <div className="cable-despacho-panel">
                            <h4><Package size={16} /> Despachos para {row.tag_unico}</h4>
                            {loadingDespachos ? (
                              <p className="text-muted">Cargando despachos...</p>
                            ) : despachos.length === 0 ? (
                              <p className="text-muted">Sin despachos registrados.</p>
                            ) : (
                              <table className="cable-despacho-table">
                                <thead>
                                  <tr>
                                    <th>Vale</th>
                                    <th>Fecha</th>
                                    <th style={{ textAlign: 'right' }}>Long. Despachada</th>
                                    <th>Solicitado Por</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {despachos.map(d => (
                                    <tr key={d.id}>
                                      <td>{d.vale_almacen}</td>
                                      <td>{new Date(d.fecha_entrega).toLocaleDateString()}</td>
                                      <td style={{ textAlign: 'right' }}>{d.longitud_despachada_m} m</td>
                                      <td>{d.solicitado_por || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
