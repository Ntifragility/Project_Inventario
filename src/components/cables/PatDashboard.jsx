import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabase';
import {
  RefreshCw, Upload, Package, Activity, Cable, Filter, FilterX,
  ChevronDown, Download, X, PanelRightOpen, FileText, FileSpreadsheet
} from 'lucide-react';
import CableGauge from './CableGauge';
import CableBarChart from './CableBarChart';
import CableImportWizard from './CableImportWizard';
import CableTable from './CableTable';
import CustomDropdown from './CustomDropdown';
import ProductionTimeline from './ProductionTimeline';
import PlanosDrawer from './PlanosDrawer';
import { cleanPatMaterialType, deriveCableMetrics, matchesDashboardFilter } from './cableMetrics';
import { useProjectArea } from '../../contexts/ProjectAreaContext';

/**
 * PatDashboard — Dashboard specifically for PAT (Puesta a Tierra) cables.
 */
export default function PatDashboard() {
  const { activeAreaId } = useProjectArea();
  // ── State ──
  const [activePatSection, setActivePatSection] = useState('conductores');
  const [showMobileDispatch, setShowMobileDispatch] = useState(false);
  const [showMobileTypeBreakdown, setShowMobileTypeBreakdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importType, setImportType] = useState(null);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);

  // Filters Raw Data
  const [rawFiltersData, setRawFiltersData] = useState([]);
  const [selectedWbs, setSelectedWbs] = useState('');
  const [selectedSistema, setSelectedSistema] = useState('');
  const [selectedTipoCable, setSelectedTipoCable] = useState('');
  const [processedSourceRows, setProcessedSourceRows] = useState([]);
  const [detailFilter, setDetailFilter] = useState(null);

  const isPvc = activePatSection === 'pvc';
  const materialPattern = isPvc ? 'TUBERIA PVC SCH%' : 'CABLE%';
  const itemLabel = isPvc ? 'Tramos' : 'Circuitos';
  const activeFilterCount = [selectedTipoCable, selectedWbs, selectedSistema, detailFilter].filter(Boolean).length;

  const getCleanMaterialType = useCallback((material = '') => {
    return cleanPatMaterialType(material, isPvc);
  }, [isPvc]);

  // Mobile layout state
  const [activeMobileTab, setActiveMobileTab] = useState('tipo');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Dynamic filter lists derived from raw data and active selections
  const filteredWbs = useMemo(() => {
    if (!selectedSistema) {
      return [...new Set(rawFiltersData.map(r => r.wbs).filter(Boolean))].sort();
    }
    return [...new Set(rawFiltersData.filter(r => r.sistema === selectedSistema).map(r => r.wbs).filter(Boolean))].sort();
  }, [rawFiltersData, selectedSistema]);

  const filteredSistemas = useMemo(() => {
    if (!selectedWbs) {
      return [...new Set(rawFiltersData.map(r => r.sistema).filter(Boolean))].sort();
    }
    return [...new Set(rawFiltersData.filter(r => r.wbs === selectedWbs).map(r => r.sistema).filter(Boolean))].sort();
  }, [rawFiltersData, selectedWbs]);

  const filteredTipos = useMemo(() => {
    let temp = rawFiltersData;
    if (selectedWbs) temp = temp.filter(r => r.wbs === selectedWbs);
    if (selectedSistema) temp = temp.filter(r => r.sistema === selectedSistema);
    return [...new Set(temp.map(r => {
      return getCleanMaterialType(r.material || '');
    }).filter(Boolean))].sort();
  }, [rawFiltersData, selectedWbs, selectedSistema, getCleanMaterialType]);

  // Reset dependent filters if they are no longer in the dynamic lists
  useEffect(() => {
    if (selectedSistema && !filteredSistemas.includes(selectedSistema)) {
      setSelectedSistema('');
    }
  }, [selectedWbs, filteredSistemas, selectedSistema]);

  useEffect(() => {
    if (selectedTipoCable && !filteredTipos.includes(selectedTipoCable)) {
      setSelectedTipoCable('');
    }
  }, [selectedWbs, selectedSistema, filteredTipos, selectedTipoCable]);

  // KPI Data
  const [kpis, setKpis] = useState({
    longitudTotal: 0,
    circuitosTotales: 0,
    longitudTendida: 0,
    circuitosEjecutados: 0,
    longitudPendiente: 0,
    circuitosPendientes: 0,
    tendidoPct: 0,
    longitudDespachada: 0,
    circuitosDespachados: 0,
    despachadoPct: 0,
    desviacionAlmacen: 0,
    circuitosDesviados: 0,
    conexOrigenPct: 0,
    conexDestinoPct: 0,
    conexOrigenPendientes: 0,
    conexDestinoPendientes: 0,
  });

  // Chart Data
  const [tipoBars, setTipoBars] = useState([]);
  const [wbsBars, setWbsBars] = useState([]);
  const [sistemaBars, setSistemaBars] = useState([]);

  // Detail table
  const [showTable, setShowTable] = useState(false);
  const [showPlanos, setShowPlanos] = useState(false);

  const timelineRows = useMemo(() => processedSourceRows.filter((row) => {
    if (selectedTipoCable && row.tipo_cable_clean !== selectedTipoCable) return false;
    if (selectedWbs && row.wbs !== selectedWbs) return false;
    if (selectedSistema && row.sistema !== selectedSistema) return false;
    return matchesDashboardFilter(row, detailFilter);
  }), [processedSourceRows, selectedTipoCable, selectedWbs, selectedSistema, detailFilter]);

  useEffect(() => {
    if (!showTable) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowTable(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showTable]);

  useEffect(() => {
    setSelectedTipoCable('');
    setSelectedWbs('');
    setSelectedSistema('');
    setShowTable(false);
    setShowMobileDispatch(false);
    setShowMobileTypeBreakdown(false);
    setDetailFilter(null);
    setProcessedSourceRows([]);
  }, [activePatSection]);

  const toggleMobileGauge = () => {
    if (window.matchMedia('(hover: none)').matches) {
      setShowMobileDispatch(current => !current);
    }
  };

  const toggleMobileTypeBreakdown = () => {
    if (window.matchMedia('(hover: none)').matches) {
      setShowMobileTypeBreakdown(current => !current);
    }
  };

  const handleClearFilters = () => {
    setSelectedTipoCable('');
    setSelectedWbs('');
    setSelectedSistema('');
    setDetailFilter(null);
  };

  const activateDetailFilter = useCallback((nextFilter) => {
    setDetailFilter(current => {
      const isSame = current
        && current.dimension === nextFilter.dimension
        && current.value === nextFilter.value
        && current.condition === nextFilter.condition;
      return isSame ? null : nextFilter;
    });
  }, []);

  const activateDetailFilterFromKeyboard = (event, filter) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateDetailFilter(filter);
    }
  };

  const handleDashboardBackgroundClick = (event) => {
    if (!detailFilter) return;

    const selectionTarget = event.target.closest(
      '.dashboard-drilldown-target, .cable-bar-fill.clickable'
    );
    if (!selectionTarget) {
      setDetailFilter(null);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════════

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch all data recursively in batches of 1000 to bypass PostgREST max_rows limit
      let rawRows = [];
      let start = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('cable_schedule')
          .select('*')
          .range(start, start + batchSize - 1)
          .eq('project_area_id', activeAreaId)
          .eq('tipo_cable', 'PAT')
          .ilike('material', materialPattern);

        const { data: batchData, error: fetchErr } = await query;
        if (fetchErr) throw fetchErr;

        if (!batchData || batchData.length === 0) {
          hasMore = false;
        } else {
          rawRows = [...rawRows, ...batchData];
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
          .select('tag_unico, longitud_despachada_m, cable_schedule!inner(project_area_id)')
          .eq('cable_schedule.project_area_id', activeAreaId)
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
      const processedRows = rawRows.map(r => {
        const cleanTipo = getCleanMaterialType(r.material || '');
        const despachado = r.despachado_override_m ?? despMap.get(r.tag_unico) ?? 0;
        const metrics = deriveCableMetrics(r, despachado);
        return {
          ...metrics,
          is_tendido: metrics.isComplete,
          tipo_cable_clean: cleanTipo || 'SIN TIPO'
        };
      });
      setProcessedSourceRows(processedRows);

      // Filter in-memory by active filters
      let rows = processedRows;
      if (selectedTipoCable) {
        rows = rows.filter(r => r.tipo_cable_clean === selectedTipoCable);
      }
      if (selectedWbs) {
        rows = rows.filter(r => r.wbs === selectedWbs);
      }
      if (selectedSistema) {
        rows = rows.filter(r => r.sistema === selectedSistema);
      }
      if (detailFilter) {
        rows = rows.filter(r => matchesDashboardFilter(r, detailFilter));
      }

      // ── Compute KPIs ──
      const longitudTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total_estimado_m) || 0), 0);
      const longitudTendida = rows.reduce((sum, r) => sum + (parseFloat(r.metrado_reportado_campo) || 0), 0);
      const longitudPendiente = rows.reduce((sum, r) => sum + (parseFloat(r.longitud_pendiente_m) || 0), 0);
      const longitudDespachada = rows.reduce((sum, r) => sum + (parseFloat(r.longitud_despachada_m) || 0), 0);
      const circuitosTotales = rows.length;
      const circuitosPendientes = rows.filter(r => r.isPending).length;
      const circuitosEjecutados = rows.filter(r => r.hasAdvance).length;
      const circuitosDespachados = rows.filter(r => r.dispatchedMeters > 0).length;
      const tendidoPct = longitudTotal > 0 ? (longitudTendida / longitudTotal) * 100 : 0;
      const despachadoPct = longitudTotal > 0 ? (longitudDespachada / longitudTotal) * 100 : 0;
      const desviacionAlmacen = longitudDespachada - longitudTendida;
      const circuitosDesviados = rows.filter(r => r.longitud_despachada_m > r.metrado_reportado_campo).length;

      // Connection stats
      const withConexOrigen = rows.filter(r => r.conexion_origen && r.is_tendido).length;
      const withConexDestino = rows.filter(r => r.conexion_destino && r.is_tendido).length;
      const totalWithOrigen = rows.filter(r => r.conexion_origen).length;
      const totalWithDestino = rows.filter(r => r.conexion_destino).length;

      // Compute type breakdown
      const countByType = {};
      rows.forEach(r => {
        const type = r.tipo_cable_clean || 'SIN TIPO';
        countByType[type] = (countByType[type] || 0) + 1;
      });
      const sortedTypes = Object.entries(countByType)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setKpis({
        longitudTotal,
        circuitosTotales,
        longitudTendida,
        circuitosEjecutados,
        longitudPendiente,
        circuitosPendientes,
        tendidoPct,
        longitudDespachada,
        circuitosDespachados,
        despachadoPct,
        desviacionAlmacen,
        circuitosDesviados,
        conexOrigenPct: totalWithOrigen > 0 ? (withConexOrigen / totalWithOrigen) * 100 : 0,
        conexDestinoPct: totalWithDestino > 0 ? (withConexDestino / totalWithDestino) * 100 : 0,
        conexOrigenPendientes: totalWithOrigen - withConexOrigen,
        conexDestinoPendientes: totalWithDestino - withConexDestino,
        circuitosPorTipo: sortedTypes,
      });

      // ── Compute bar chart data by TIPO ──
      const tipoMap = new Map();
      rows.forEach(r => {
        const key = r.tipo_cable_clean || 'SIN TIPO';
        if (!tipoMap.has(key)) tipoMap.set(key, { name: key, filterValue: key, tendido: 0, porTender: 0 });
        const entry = tipoMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setTipoBars(
        [...tipoMap.values()].map(val => ({
          name: val.name,
          filterValue: val.filterValue,
          tendido: val.tendido,
          porTender: val.porTender,
          total: val.tendido + val.porTender,
        }))
      );

      // ── Compute bar chart data by WBS ──
      const wbsMap = new Map();
      rows.forEach(r => {
        const filterValue = r.wbs || null;
        const key = filterValue ?? '__SIN_WBS__';
        if (!wbsMap.has(key)) wbsMap.set(key, { name: filterValue || 'SIN WBS', filterValue, tendido: 0, porTender: 0 });
        const entry = wbsMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setWbsBars(
        [...wbsMap.values()].map(val => ({
          name: val.name,
          filterValue: val.filterValue,
          tendido: val.tendido,
          porTender: val.porTender,
          total: val.tendido + val.porTender,
        }))
      );

      // ── Compute bar chart data by SISTEMA ──
      const sisMap = new Map();
      rows.forEach(r => {
        const filterValue = r.sistema || null;
        const key = filterValue ?? '__SIN_SISTEMA__';
        if (!sisMap.has(key)) sisMap.set(key, { name: filterValue || 'SIN SISTEMA', filterValue, tendido: 0, porTender: 0 });
        const entry = sisMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setSistemaBars(
        [...sisMap.values()].map(val => ({
          name: val.name,
          filterValue: val.filterValue,
          tendido: val.tendido,
          porTender: val.porTender,
          total: val.tendido + val.porTender,
        }))
      );

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [selectedWbs, selectedSistema, selectedTipoCable, detailFilter, materialPattern, getCleanMaterialType, activeAreaId]);

  // Fetch filter options
  const fetchFilters = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('cable_schedule')
        .select('wbs, sistema, material')
        .eq('project_area_id', activeAreaId)
        .eq('tipo_cable', 'PAT')
        .ilike('material', materialPattern);

      setRawFiltersData(data || []);
    } catch (err) {
      console.error('Error fetching filters:', err);
    }
  }, [materialPattern, activeAreaId]);

  useEffect(() => {
    handleClearFilters();
    setShowTable(false);
    setProcessedSourceRows([]);
  }, [activeAreaId]);

  useEffect(() => {
    fetchFilters();
    fetchData();
  }, [fetchData, fetchFilters]);

  useEffect(() => {
    setShowUploadPrompt(true);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  const formatNumber = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
    return Math.round(n).toLocaleString();
  };

  const openImport = (type) => {
    setImportType(type);
    setShowImportWizard(true);
  };

  const handleImportComplete = () => {
    setShowImportWizard(false);
    setDetailFilter(null);
    fetchData();
    fetchFilters();
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div
      id="cable-dashboard"
      className="tab-content active pat-dashboard"
      onClick={handleDashboardBackgroundClick}
    >
      <div className="pat-section-switcher" style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 4, width: 'fit-content', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <button
          className={`btn btn-sm ${!isPvc ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActivePatSection('conductores')}
        >
          Conductores PAT
        </button>
        <button
          className={`btn btn-sm ${isPvc ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActivePatSection('pvc')}
        >
          Tubería PVC
        </button>
        <button
          className="btn btn-secondary btn-sm cable-mobile-filter-toggle"
          style={{ display: 'none' }}
          onClick={(event) => {
            event.stopPropagation();
            setShowMobileFilters(!showMobileFilters);
          }}
        >
          <Filter size={14} />
          <span>Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
        </button>
      </div>

      {/* ── Top Bar: Filters + Actions ── */}
      <div className="cable-topbar" onClick={(event) => event.stopPropagation()}>
        {showMobileFilters && <button className="cable-mobile-filter-backdrop" onClick={() => setShowMobileFilters(false)} aria-label="Cerrar filtros" />}
        <div className={`cable-filters ${showMobileFilters ? 'expanded' : ''}`}>
          <div className="cable-mobile-filter-header">
            <button onClick={() => setShowMobileFilters(false)} aria-label="Cerrar filtros"><X size={20} /></button>
          </div>
          <CustomDropdown
            label={isPvc ? 'Tipo de Tubería' : 'Tipo de Cable'}
            value={selectedTipoCable}
            options={filteredTipos}
            onChange={(value) => { setSelectedTipoCable(value); setDetailFilter(null); }}
          />
          <CustomDropdown
            label="WBS"
            value={selectedWbs}
            options={filteredWbs}
            onChange={(value) => { setSelectedWbs(value); setDetailFilter(null); }}
          />
          <CustomDropdown
            label="Sistema"
            value={selectedSistema}
            options={filteredSistemas}
            onChange={(value) => { setSelectedSistema(value); setDetailFilter(null); }}
          />
          {(selectedTipoCable || selectedWbs || selectedSistema || detailFilter) && (
            <button className="btn btn-secondary btn-sm" onClick={handleClearFilters} title="Limpiar todos los filtros" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FilterX size={14} />
              <span>Limpiar Filtros</span>
            </button>
          )}
          <button className="btn btn-primary cable-mobile-filter-apply" onClick={() => setShowMobileFilters(false)}>Aplicar</button>
        </div>
        <div className="cable-actions">
          <button className="btn btn-primary btn-sm" onClick={() => openImport('pat')}>
            <Upload size={14} /> Importar Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="message danger" style={{ margin: '0 0 16px 0' }}>
          <span>{error}</span>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="cable-kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div
          className={`cable-kpi-card type-breakdown-card ${showMobileTypeBreakdown ? 'mobile-show-breakdown' : ''}`}
          onClick={toggleMobileTypeBreakdown}
          role="button"
          tabIndex={0}
          aria-label={`Mostrar ${itemLabel.toLowerCase()} por tipo`}
        >
          <div className="kpi-card-front">
            <span className="cable-kpi-value accent">{formatNumber(kpis.longitudTotal)}</span>
            <span className="cable-kpi-label">Longitud Total (m)</span>
            <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
              <span className="cable-kpi-sub-value">{kpis.circuitosTotales.toLocaleString()}</span>
              <span className="cable-kpi-sub-label">{itemLabel} Totales (und)</span>
            </div>
          </div>
          <div className="kpi-card-back">
            <div style={{ fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: 6, marginBottom: 6, textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              {itemLabel} por Tipo (und):
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {(kpis.circuitosPorTipo || []).map(item => (
                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '4px 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{item.name}</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.count}</span>
                </div>
              ))}
              {(!kpis.circuitosPorTipo || kpis.circuitosPorTipo.length === 0) && (
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Sin datos</div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`cable-kpi-card dashboard-drilldown-target ${detailFilter?.dimension === null && detailFilter?.condition === 'dispatched' ? 'active' : ''}`}
          onClick={() => activateDetailFilter({ source: 'kpi', dimension: null, value: null, label: 'Despachados', condition: 'dispatched' })}
          onKeyDown={(event) => activateDetailFilterFromKeyboard(event, { source: 'kpi', dimension: null, value: null, label: 'Despachados', condition: 'dispatched' })}
          role="button"
          tabIndex={0}
        >
          <span className="cable-kpi-value" style={{ color: '#3b82f6' }}>{formatNumber(kpis.longitudDespachada)}</span>
          <span className="cable-kpi-label">Longitud Despachada (m)</span>
          <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
            <span className="cable-kpi-sub-value" style={{ color: '#3b82f6' }}>{kpis.circuitosDespachados.toLocaleString()}</span>
            <span className="cable-kpi-sub-label">{itemLabel} Despachados (und)</span>
          </div>
        </div>

        <div
          className={`cable-kpi-card dashboard-drilldown-target ${detailFilter?.dimension === null && detailFilter?.condition === 'advance' ? 'active' : ''}`}
          onClick={() => activateDetailFilter({ source: 'kpi', dimension: null, value: null, label: 'Con avance', condition: 'advance' })}
          onKeyDown={(event) => activateDetailFilterFromKeyboard(event, { source: 'kpi', dimension: null, value: null, label: 'Con avance', condition: 'advance' })}
          role="button"
          tabIndex={0}
        >
          <span className="cable-kpi-value" style={{ color: '#10b981' }}>{formatNumber(kpis.longitudTendida)}</span>
          <span className="cable-kpi-label">Longitud Ejecutada (m)</span>
          <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
            <span className="cable-kpi-sub-value" style={{ color: '#10b981' }}>{kpis.circuitosEjecutados.toLocaleString()}</span>
            <span className="cable-kpi-sub-label">{itemLabel} con Avance (und)</span>
          </div>
        </div>

        <div
          className={`cable-kpi-card dashboard-drilldown-target ${detailFilter?.dimension === null && detailFilter?.condition === 'pending' ? 'active' : ''}`}
          onClick={() => activateDetailFilter({ source: 'kpi', dimension: null, value: null, label: 'Pendientes', condition: 'pending' })}
          onKeyDown={(event) => activateDetailFilterFromKeyboard(event, { source: 'kpi', dimension: null, value: null, label: 'Pendientes', condition: 'pending' })}
          role="button"
          tabIndex={0}
        >
          <span className="cable-kpi-value warning">{formatNumber(kpis.longitudPendiente)}</span>
          <span className="cable-kpi-label">Longitud Pendiente (m)</span>
          <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
            <span className="cable-kpi-sub-value">{kpis.circuitosPendientes.toLocaleString()}</span>
            <span className="cable-kpi-sub-label">{itemLabel} Pendientes (und)</span>
          </div>
        </div>

        <div
          className={`cable-kpi-card highlight progress-gauge-card ${showMobileDispatch ? 'mobile-show-dispatched' : ''}`}
          onClick={toggleMobileGauge}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setShowMobileDispatch(current => !current);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={showMobileDispatch ? 'Mostrar avance tendido' : 'Mostrar avance despachado'}
        >
          <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
            <div className="kpi-card-front" style={{ position: 'absolute', inset: 0 }}>
              <CableGauge
                value={kpis.tendidoPct}
                label={isPvc ? 'INSTALADO' : 'TENDIDO'}
                size={110}
                strokeWidth={8}
                color="#f59e0b"
                bgColor="rgba(255,255,255,0.08)"
                type="donut"
              />
            </div>
            <div className="kpi-card-back" style={{ inset: 0, padding: 0, alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
              <CableGauge
                value={kpis.despachadoPct}
                label="DESPACHADO"
                size={110}
                strokeWidth={8}
                color="#3b82f6"
                bgColor="rgba(255,255,255,0.08)"
                type="donut"
              />
            </div>
          </div>
        </div>

        <div
          className={`cable-kpi-card cable-mobile-hide dashboard-drilldown-target ${detailFilter?.dimension === null && detailFilter?.condition === 'deviation' ? 'active' : ''}`}
          onClick={() => activateDetailFilter({ source: 'kpi', dimension: null, value: null, label: 'Desviación de almacén', condition: 'deviation' })}
          onKeyDown={(event) => activateDetailFilterFromKeyboard(event, { source: 'kpi', dimension: null, value: null, label: 'Desviación de almacén', condition: 'deviation' })}
          role="button"
          tabIndex={0}
        >
          <span className="cable-kpi-value warning" style={{ color: '#ef4444' }}>{formatNumber(kpis.desviacionAlmacen)}</span>
          <span className="cable-kpi-label">Desviación de Almacén (m)</span>
          <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
            <span className="cable-kpi-sub-value">{kpis.circuitosDesviados.toLocaleString()}</span>
            <span className="cable-kpi-sub-label">{itemLabel} Desviados (und)</span>
          </div>
        </div>
      </div>

      {/* ── Mobile Chart Tabs ── */}
      <div className="cable-mobile-tabs" style={{ display: 'none' }}>
        <button
          className={`cable-mobile-tab-btn ${activeMobileTab === 'tipo' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('tipo')}
        >
          Tipo
        </button>
        <button
          className={`cable-mobile-tab-btn ${activeMobileTab === 'wbs' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('wbs')}
        >
          WBS
        </button>
        <button
          className={`cable-mobile-tab-btn ${activeMobileTab === 'sistema' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('sistema')}
        >
          Sistema
        </button>
      </div>

      {/* ── Charts Row ── */}
      <div className="cable-charts-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className={`cable-chart-col ${activeMobileTab === 'tipo' ? 'mobile-active' : ''}`}>
          <CableBarChart
            data={tipoBars}
            title={`Longitud de ${isPvc ? 'Tubería PVC' : 'Cable'} (m) según Tipo`}
            dimension="tipo"
            onSegmentClick={activateDetailFilter}
            activeSelection={detailFilter}
          />
        </div>
        <div className={`cable-chart-col ${activeMobileTab === 'wbs' ? 'mobile-active' : ''}`}>
          <CableBarChart
            data={wbsBars}
            title={`Longitud de ${isPvc ? 'Tubería PVC' : 'Cable'} (m) según WBS`}
            dimension="wbs"
            onSegmentClick={activateDetailFilter}
            activeSelection={detailFilter}
          />
        </div>
        <div className={`cable-chart-col ${activeMobileTab === 'sistema' ? 'mobile-active' : ''}`}>
          <CableBarChart
            data={sistemaBars}
            title={`Longitud de ${isPvc ? 'Tubería PVC' : 'Cable'} (m) según Sistema`}
            dimension="sistema"
            onSegmentClick={activateDetailFilter}
            activeSelection={detailFilter}
          />
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="cable-mobile-filter-chips" onClick={(event) => event.stopPropagation()}>
          {selectedTipoCable && <button onClick={() => setSelectedTipoCable('')}>{selectedTipoCable}<X size={12} /></button>}
          {selectedWbs && <button onClick={() => setSelectedWbs('')}>WBS {selectedWbs}<X size={12} /></button>}
          {selectedSistema && <button onClick={() => setSelectedSistema('')}>{selectedSistema}<X size={12} /></button>}
          {detailFilter && <button onClick={() => setDetailFilter(null)}>{detailFilter.segmentLabel || detailFilter.label}<X size={12} /></button>}
          <button className="clear" onClick={handleClearFilters}>Limpiar</button>
        </div>
      )}

      <ProductionTimeline
        rows={timelineRows}
        activeFilter={detailFilter}
        onPeriodClick={activateDetailFilter}
      />

      {/* ── Detail Table Toggle ── */}
      <button
        className={`pat-detail-tab planos-tab ${showPlanos ? 'open' : ''}`}
        onClick={(event) => { event.stopPropagation(); setShowTable(false); setShowPlanos(true); }}
        aria-label="Abrir planos"
      >
        <FileText size={18} />
        <span>Planos</span>
      </button>
      <button
        className={`pat-detail-tab ${showTable ? 'open' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          setShowPlanos(false);
          setShowTable(true);
        }}
        aria-label={`Abrir detalle de ${itemLabel}`}
        aria-expanded={showTable}
      >
        <PanelRightOpen size={18} />
        <span>Detalle de {itemLabel}</span>
      </button>

      {showTable && (
        <>
          <button
            className="pat-detail-backdrop"
            onClick={(event) => {
              event.stopPropagation();
              setShowTable(false);
            }}
            aria-label="Cerrar detalle"
          />
          <aside className="pat-detail-drawer" aria-label={`Detalle de ${itemLabel}`} onClick={(event) => event.stopPropagation()}>
            <div className="pat-detail-drawer-header">
              <div>
                <strong>Detalle de {itemLabel}</strong>
                <span>La selección del dashboard se aplica a esta lista.</span>
              </div>
              <button className="pat-detail-close" onClick={() => setShowTable(false)} aria-label="Cerrar detalle">
                <X size={20} />
              </button>
            </div>
            <div className="pat-detail-drawer-body">
          {detailFilter && (
            <div className="dashboard-detail-filter-banner">
              <div>
                <strong>Filtro del dashboard:</strong>{' '}
                {detailFilter.dimension ? `${detailFilter.dimension.toUpperCase()}: ${detailFilter.label} · ` : ''}
                {detailFilter.segmentLabel || detailFilter.label}
              </div>
            </div>
          )}
          <CableTable
            filterWbs={selectedWbs}
            filterSistema={selectedSistema}
            filterCleanTipo={selectedTipoCable}
            filterTipoCable="PAT"
            filterMaterialPrefix={isPvc ? 'TUBERIA PVC SCH' : 'CABLE'}
            sourceData={processedSourceRows}
            dashboardFilter={detailFilter}
            onDataChanged={async () => {
              setDetailFilter(null);
              await Promise.all([fetchData(), fetchFilters()]);
            }}
          />
            </div>
          </aside>
        </>
      )}

      {/* ── Import Wizard Modal ── */}
      <PlanosDrawer open={showPlanos} onClose={() => setShowPlanos(false)} />

      {showImportWizard && (
        <CableImportWizard
          forceType={importType}
          onClose={() => setShowImportWizard(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {showUploadPrompt && (
        <div className="dialog-overlay planos-dialog-overlay" onClick={() => setShowUploadPrompt(false)}>
          <div className="dialog-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={18} style={{ color: 'var(--primary)' }} />
                <span>Importar datos de PAT</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem' }}>
                ¿Desea importar un archivo de Excel para Puesta a Tierra (PAT)?
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                <button className="btn btn-secondary" onClick={() => setShowUploadPrompt(false)}>
                  No
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowUploadPrompt(false);
                    openImport('pat');
                  }}
                >
                  Sí, importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
