import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import {
  Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ArrowUpDown, Package, Filter, FilterX, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cleanPatMaterialType, deriveCableMetrics, matchesDashboardFilter } from './cableMetrics';

export default function CableTable({ filterArea = '', filterTipoServicio = '', filterTipoCable = '', filterWbs = '', filterSistema = '', filterCleanTipo = '', filterMaterialPrefix = 'CABLE', sourceData = null, dashboardFilter = null }) {
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

  const isPvc = filterMaterialPrefix.toUpperCase().startsWith('TUBERIA PVC');
  const itemLabel = isPvc ? 'tramos' : 'circuitos';

  const COLUMNS = filterTipoCable === 'PAT' ? [
    { field: 'tag_unico', label: 'TAG UNICO', width: '144px' },
    { field: 'wbs', label: 'WBS', width: '60px' },
    { field: 'sistema', label: 'Sistema', width: '252px' },
    { field: 'material', label: isPvc ? 'Descripción de Tubería' : 'Descripción de Cable', width: '200px' },
    { field: 'total_estimado_m', label: 'Metrado\nOT (m)', width: '110px', align: 'right' },
    { field: 'total_despachado_m', label: 'Metrado\nDespachado (m)', width: '130px', align: 'right' },
    { field: 'metrado_reportado_campo', label: 'Metrado\nCampo (m)', width: '110px', align: 'right' },
    { field: 'avance', label: '% Avance', width: '90px', align: 'center', computed: true },
    { field: 'fecha_tendido', label: 'Fecha Metrado\nCampo', width: '120px', align: 'center' },
  ] : [
    { field: 'tag_unico', label: 'TAG UNICO', width: '180px' },
    { field: 'area', label: 'Área', width: '100px' },
    { field: 'tipo_cable', label: 'Tipo Cable', width: '180px' },
    { field: 'total_estimado_m', label: 'Long. Diseño\n(m)', width: '120px', align: 'right' },
    { field: 'total_despachado_m', label: 'Metrado\nDespachado (m)', width: '140px', align: 'right' },
    { field: 'metrado_reportado_campo', label: 'Metrado\nCampo (m)', width: '120px', align: 'right' },
    { field: 'avance', label: '% Avance', width: '100px', align: 'center', computed: true },
    { field: 'estado', label: 'Estado', width: '120px', align: 'center' },
    { field: 'conexion_origen', label: 'Conex. Origen', width: '150px' },
    { field: 'conexion_destino', label: 'Conex. Destino', width: '150px' },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (Array.isArray(sourceData)) {
        let localRows = sourceData.map(row => ({
          ...deriveCableMetrics(row),
          tipo_cable_clean: row.tipo_cable_clean || cleanPatMaterialType(row.material, isPvc) || 'SIN TIPO',
        }));

        if (filterArea) localRows = localRows.filter(row => row.area === filterArea);
        if (filterTipoServicio) localRows = localRows.filter(row => row.tipo_servicio === filterTipoServicio);
        if (filterTipoCable) localRows = localRows.filter(row => row.tipo_cable === filterTipoCable);
        if (filterWbs) localRows = localRows.filter(row => row.wbs === filterWbs);
        if (filterSistema) localRows = localRows.filter(row => row.sistema === filterSistema);
        if (filterCleanTipo) localRows = localRows.filter(row => row.tipo_cable_clean === filterCleanTipo);

        if (search.trim()) {
          const term = search.trim().toUpperCase();
          localRows = localRows.filter(row => [row.tag_unico, row.tipo_cable, row.area, row.wbs, row.sistema, row.plano]
            .some(value => String(value || '').toUpperCase().includes(term)));
        }

        localRows.sort((a, b) => {
          const aValue = sortField === 'avance' ? a.advancePercent : a[sortField];
          const bValue = sortField === 'avance' ? b.advancePercent : b[sortField];
          const direction = sortDir === 'asc' ? 1 : -1;
          if (typeof aValue === 'number' || typeof bValue === 'number') {
            return ((parseFloat(aValue) || 0) - (parseFloat(bValue) || 0)) * direction;
          }
          return String(aValue || '').localeCompare(String(bValue || '')) * direction;
        });

        setData(localRows);
        return;
      }

      let rows = [];
      let start = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('cable_schedule')
          .select('*')
          .range(start, start + batchSize - 1)
          .ilike('material', `${filterMaterialPrefix}%`);

        if (filterArea) query = query.eq('area', filterArea);
        if (filterTipoServicio) query = query.eq('tipo_servicio', filterTipoServicio);
        if (filterTipoCable) query = query.eq('tipo_cable', filterTipoCable);
        if (filterWbs) query = query.eq('wbs', filterWbs);
        if (filterSistema) query = query.eq('sistema', filterSistema);

        if (search.trim()) {
          const searchTerm = search.trim().replace(/\*/g, '%');
          query = query.or(`tag_unico.ilike.%${searchTerm}%,tipo_cable.ilike.%${searchTerm}%,area.ilike.%${searchTerm}%,wbs.ilike.%${searchTerm}%,plano.ilike.%${searchTerm}%`);
        }
        query = query.order(sortField, { ascending: sortDir === 'asc' });

        const { data: batchData, error } = await query;
        if (error) throw error;

        if (!batchData || batchData.length === 0) {
          hasMore = false;
        } else {
          rows = [...rows, ...batchData];
          if (batchData.length < batchSize) {
            hasMore = false;
          } else {
            start += batchSize;
          }
        }
      }

      // Fetch all despachos recursively
      let allDespachos = [];
      let despStart = 0;
      let despHasMore = true;

      while (despHasMore) {
        const { data: despBatch, error: despErr } = await supabase
          .from('cable_despachos')
          .select('tag_unico, longitud_despachada_m')
          .range(despStart, despStart + batchSize - 1);

        if (despErr) throw despErr;

        if (!despBatch || despBatch.length === 0) {
          despHasMore = false;
        } else {
          allDespachos = [...allDespachos, ...despBatch];
          if (despBatch.length < batchSize) {
            despHasMore = false;
          } else {
            despStart += batchSize;
          }
        }
      }

      const despMap = new Map();
      allDespachos.forEach(d => {
        despMap.set(d.tag_unico, (despMap.get(d.tag_unico) || 0) + (parseFloat(d.longitud_despachada_m) || 0));
      });
      
      let finalRows = (rows || []).map(r => ({
        ...deriveCableMetrics(r, despMap.get(r.tag_unico) || 0),
        tipo_cable_clean: cleanPatMaterialType(r.material, isPvc) || 'SIN TIPO',
      }));

      if (filterCleanTipo) {
        finalRows = finalRows.filter(r => {
          return r.tipo_cable_clean === filterCleanTipo;
        });
      }
      
      setData(finalRows);
    } catch (err) {
      console.error('Cable table fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterArea, filterTipoServicio, filterTipoCable, filterWbs, filterSistema, filterCleanTipo, filterMaterialPrefix, isPvc, search, sortField, sortDir, sourceData]);

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
    if (Number.isFinite(row.advancePercent)) return row.advancePercent;
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

  const getFilterValue = (row, field) => {
    if (field === 'avance') return `${getAvance(row).toFixed(0)}%`;
    return (row[field] || '—').toString();
  };

  const getUniqueValues = (field) => {
    const vals = data.map(r => getFilterValue(r, field));
    const uniqueValues = [...new Set(vals)];
    if (field === 'avance') {
      return uniqueValues.sort((a, b) => parseFloat(a) - parseFloat(b));
    }
    return uniqueValues.sort();
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
    if (!matchesDashboardFilter(row, dashboardFilter)) return false;
    return Object.entries(headerFilters).every(([key, selectedValues]) => {
      if (!selectedValues) return true;
      const cellValue = getFilterValue(row, key);
      return selectedValues.includes(cellValue);
    });
  });

  const handleExportExcel = () => {
    const sheetData = filteredData.map(row => {
      const obj = {};
      COLUMNS.forEach(col => {
        let val = '';
        if (col.field === 'avance') {
          const total = parseFloat(row.total_estimado_m) || 0;
          const metrado = parseFloat(row.metrado_reportado_campo) || 0;
          val = total <= 0 ? '0%' : `${Math.min(100, Math.round((metrado / total) * 100))}%`;
        } else {
          val = row[col.field] ?? '—';
        }
        obj[col.label.replace(/\n/g, ' ')] = val;
      });
      return obj;
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, filterTipoCable === 'PAT' ? 'PAT' : 'Circuitos');
    
    const wbsStr = filterWbs ? `_${filterWbs}` : '';
    const sistemaStr = filterSistema ? `_${filterSistema.slice(0, 15)}` : '';
    const cleanTipoStr = filterCleanTipo ? `_${filterCleanTipo.slice(0, 15)}` : '';
    const filename = `CableSchedule_${filterTipoCable === 'PAT' ? 'PAT' : 'Circuitos'}${wbsStr}${sistemaStr}${cleanTipoStr}.xlsx`;
    
    XLSX.writeFile(workbook, filename);
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportExcel}
            disabled={filteredData.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Exportar tabla filtrada a Excel"
          >
            <Download size={14} />
            <span>Exportar Excel</span>
          </button>
          <div className="cable-count text-muted" style={{ whiteSpace: 'nowrap' }}>
            {filteredData.length} {itemLabel} encontrados
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh', position: 'relative' }}>
        {/* Mobile View: Card List */}
        <div className="cable-mobile-card-list" style={{ display: 'none' }}>
          {filteredData.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '24px 0' }}>No se encontraron {itemLabel}.</div>
          ) : (
            filteredData.map(row => {
              const isExpanded = expandedRow === row.tag_unico;
              const avance = getAvance(row);

              return (
                <div
                  key={row.tag_unico}
                  className="cable-mobile-card"
                  onClick={() => toggleExpand(row.tag_unico)}
                >
                  <div className="cable-mobile-card-header">
                    <span>{row.tag_unico}</span>
                    {filterTipoCable === 'PAT' ? (
                      <span className="status-badge" style={{ background: 'rgba(255, 255, 255, 0.08)' }}>{isPvc ? 'PVC' : 'PAT'}</span>
                    ) : (
                      getEstadoBadge(row.estado)
                    )}
                  </div>

                  <div className="cable-mobile-card-progress">
                    <div className="cable-mobile-card-progress-bar-bg">
                      <div
                        className="cable-mobile-card-progress-bar-fill"
                        style={{
                          width: `${avance}%`,
                          background: avance >= 100 ? '#10b981' : avance > 50 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="cable-mobile-card-progress-pct">{avance.toFixed(0)}%</span>
                  </div>

                  {isExpanded && (
                    <div className="cable-mobile-card-details" onClick={(e) => e.stopPropagation()}>
                      {filterTipoCable === 'PAT' ? (
                        <>
                          <div className="cable-mobile-card-detail-item">
                            <strong>WBS:</strong> <span>{row.wbs || '—'}</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Sistema:</strong> <span>{row.sistema || '—'}</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>{isPvc ? 'Tubería' : 'Descripción'}:</strong> <span>{row.material || '—'}</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Metrado OT (m):</strong> <span>{parseFloat(row.total_estimado_m || 0).toFixed(1)} m</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Metrado Despachado (m):</strong> <span>{parseFloat(row.total_despachado_m || 0).toFixed(1)} m</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Metrado Campo (m):</strong> <span>{parseFloat(row.metrado_reportado_campo || 0).toFixed(1)} m</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Fecha Metrado Campo:</strong> <span>{row.fecha_tendido || '—'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Área:</strong> <span>{row.area || '—'}</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Tipo Cable:</strong> <span>{row.tipo_cable || '—'}</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Long. Diseño (m):</strong> <span>{parseFloat(row.total_estimado_m || 0).toFixed(1)} m</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Metrado Despachado (m):</strong> <span>{parseFloat(row.total_despachado_m || 0).toFixed(1)} m</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Metrado Campo (m):</strong> <span>{parseFloat(row.metrado_reportado_campo || 0).toFixed(1)} m</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Conex. Origen:</strong> <span>{row.conexion_origen || '—'}</span>
                          </div>
                          <div className="cable-mobile-card-detail-item">
                            <strong>Conex. Destino:</strong> <span>{row.conexion_destino || '—'}</span>
                          </div>

                          {/* Mobile subtable for Despachos */}
                          <div className="cable-mobile-card-detail-subtable">
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Package size={14} /> Despachos
                            </h4>
                            {loadingDespachos ? (
                              <p className="text-muted" style={{ margin: 0, fontSize: '0.7rem' }}>Cargando despachos...</p>
                            ) : despachos.length === 0 ? (
                              <p className="text-muted" style={{ margin: 0, fontSize: '0.7rem' }}>Sin despachos registrados.</p>
                            ) : (
                              despachos.map(d => (
                                <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '4px', marginBottom: '4px', fontSize: '0.7rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>Vale: {d.vale_almacen}</strong>
                                    <span>{new Date(d.fecha_entrega).toLocaleDateString()}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                    <span>Cant: {d.longitud_despachada_m} m</span>
                                    <span>Por: {d.solicitado_por || '—'}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <table className="cable-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 0 var(--border-color)' }}></th>
              {COLUMNS.map(col => {
                const isFilterActive = activeFilter === col.field;
                const allVals = isFilterActive ? getUniqueValues(col.field) : [];
                const searchVals = isFilterActive ? allVals.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase())) : [];
                const isAllSelected = isFilterActive && searchVals.length > 0 && searchVals.every(v => tempFilters.includes(v));

                return (
                  <th
                    key={col.field}
                    style={{ width: col.width, textAlign: col.align || 'left', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card)', boxShadow: '0 1px 0 var(--border-color)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'space-between' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: col.computed ? 'default' : 'pointer', whiteSpace: 'pre-line', lineHeight: '1.2' }}
                        onClick={() => !col.computed && handleSort(col.field)}
                      >
                        {col.label}
                        {!col.computed && sortField === col.field && (
                          <ArrowUpDown size={12} className={sortDir === 'desc' ? 'flipped' : ''} />
                        )}
                      </div>
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
                  No se encontraron {itemLabel}.
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
                          <td>{row.material || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.total_estimado_m || 0).toFixed(1)}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.total_despachado_m || 0).toFixed(1)}</td>
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
                          <td style={{ textAlign: 'right' }}>{parseFloat(row.total_despachado_m || 0).toFixed(1)}</td>
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
