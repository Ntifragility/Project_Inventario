import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { application } from '../../app/composition/createApplication.js';
import {
  RefreshCw, Upload, Package, Activity, Cable, Filter, FilterX,
  ChevronDown, Search, Download
} from 'lucide-react';
import CableGauge from './CableGauge';
import CableBarChart from './CableBarChart';
import CableImportWizard from './CableImportWizard';
import CableTable from './CableTable';
import CustomDropdown from './CustomDropdown';
import { useProjectArea } from '../../contexts/ProjectAreaContext';

/**
 * CableDashboard — Main view for the Cable Schedule Manager.
 * Displays KPIs, charts, gauges, and a detail table matching the reference dashboard.
 */
export default function CableDashboard() {
  const { activeAreaId } = useProjectArea();
  // ── State ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importType, setImportType] = useState(null);

  // Filters Raw Data
  const [rawFiltersData, setRawFiltersData] = useState([]);
  const [selectedWbs, setSelectedWbs] = useState('');
  const [selectedSistema, setSelectedSistema] = useState('');
  const [selectedTipoCable, setSelectedTipoCable] = useState('');

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
      const materialStr = r.material || '';
      return materialStr.replace(/^cable\s+/i, '').trim().toUpperCase();
    }).filter(Boolean))].sort();
  }, [rawFiltersData, selectedWbs, selectedSistema]);

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
    longitudPendiente: 0,
    circuitosPendientes: 0,
    tendidoPct: 0,
    longitudDespachada: 0,
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

  const handleClearFilters = () => {
    setSelectedTipoCable('');
    setSelectedWbs('');
    setSelectedSistema('');
  };

  // ══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════════

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const dashboard = await application.cableSchedule.loadCircuitDashboard({
        areaId: activeAreaId,
        filters: {
          type: selectedTipoCable,
          wbs: selectedWbs,
          system: selectedSistema,
        },
      });
      setRawFiltersData(dashboard.filterRows);
      setKpis(dashboard.kpis);
      setTipoBars(dashboard.tipoBars);
      setWbsBars(dashboard.wbsBars);
      setSistemaBars(dashboard.sistemaBars);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [selectedWbs, selectedSistema, selectedTipoCable, activeAreaId]);

  useEffect(() => {
    handleClearFilters();
    setShowTable(false);
  }, [activeAreaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    fetchData();
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div id="cable-dashboard" className="tab-content active">
      {/* ── Top Bar: Filters + Actions ── */}
      <div className="cable-topbar">
        <button
          className="btn btn-secondary btn-sm cable-mobile-filter-toggle"
          style={{ display: 'none' }}
          onClick={() => setShowMobileFilters(!showMobileFilters)}
        >
          <Filter size={14} />
          <span>{showMobileFilters ? 'Ocultar Filtros' : 'Filtros y Acciones'}</span>
        </button>

        <div className={`cable-filters ${showMobileFilters ? 'expanded' : ''}`}>
          <CustomDropdown
            label="Tipo de Cable"
            value={selectedTipoCable}
            options={filteredTipos}
            onChange={setSelectedTipoCable}
          />
          <CustomDropdown
            label="WBS"
            value={selectedWbs}
            options={filteredWbs}
            onChange={setSelectedWbs}
          />
          <CustomDropdown
            label="Sistema"
            value={selectedSistema}
            options={filteredSistemas}
            onChange={setSelectedSistema}
          />
          {(selectedTipoCable || selectedWbs || selectedSistema) && (
            <button className="btn btn-secondary btn-sm" onClick={handleClearFilters} title="Limpiar todos los filtros" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FilterX size={14} />
              <span>Limpiar Filtros</span>
            </button>
          )}
        </div>
        <div className="cable-actions">
          <button className="btn btn-primary btn-sm" onClick={() => openImport('schedule')}>
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
          <div className="cable-kpi-card">
            <span className="cable-kpi-value accent">{formatNumber(kpis.longitudTotal)}</span>
            <span className="cable-kpi-label">Longitud Total (m)</span>
          </div>
          <div className="cable-kpi-card">
            <div className="kpi-card-front">
              <span className="cable-kpi-value accent">{kpis.circuitosTotales.toLocaleString()}</span>
              <span className="cable-kpi-label">Circuitos Totales</span>
            </div>
            {kpis.circuitosPorTipo && kpis.circuitosPorTipo.length > 0 && (
              <div className="kpi-card-back">
                <div style={{ fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '6px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                  Circuitos por Tipo:
                </div>
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                  {kpis.circuitosPorTipo.map(item => (
                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', margin: '4px 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{item.name}</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="cable-kpi-card highlight">
            <CableGauge
              value={kpis.tendidoPct}
              label="TENDIDO"
              size={110}
              strokeWidth={8}
              color="#f59e0b"
              bgColor="rgba(255,255,255,0.08)"
              type="donut"
            />
          </div>
          <div className="cable-kpi-card highlight">
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
          <div className="cable-kpi-card">
            <span className="cable-kpi-value warning">{formatNumber(kpis.longitudPendiente)}</span>
            <span className="cable-kpi-label">Longitud Pendiente</span>
            <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
              <span className="cable-kpi-sub-value">{kpis.circuitosPendientes.toLocaleString()}</span>
              <span className="cable-kpi-sub-label">Circuitos Pendientes</span>
            </div>
          </div>
          <div className="cable-kpi-card">
            <span className="cable-kpi-value warning" style={{ color: '#ef4444' }}>{formatNumber(kpis.desviacionAlmacen)}</span>
            <span className="cable-kpi-label">Desviación de Almacén</span>
            <div className="cable-kpi-sub" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px' }}>
              <span className="cable-kpi-sub-value">{kpis.circuitosDesviados.toLocaleString()}</span>
              <span className="cable-kpi-sub-label">Circuitos Desviados</span>
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
        <div className="cable-charts-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
          <div className={`cable-chart-col ${activeMobileTab === 'tipo' ? 'mobile-active' : ''}`}>
            <CableBarChart
              data={tipoBars}
              title="Longitud de Cable (m) según Tipo"
            />
          </div>
          <div className={`cable-chart-col ${activeMobileTab === 'wbs' ? 'mobile-active' : ''}`}>
            <CableBarChart
              data={wbsBars}
              title="Longitud de Cable (m) según WBS"
            />
          </div>
          <div className={`cable-chart-col ${activeMobileTab === 'sistema' ? 'mobile-active' : ''}`}>
            <CableBarChart
              data={sistemaBars}
              title="Longitud de Cable (m) según Sistema"
            />
          </div>
        </div>

        {/* ── Detail Table Toggle ── */}
        <div className="cable-table-section">
          <button
            className="btn btn-secondary"
            onClick={() => setShowTable(!showTable)}
            style={{ marginBottom: 16 }}
          >
            <Search size={14} />
            {showTable ? 'Ocultar Detalle' : 'Ver Detalle de Circuitos'}
          </button>

          {showTable && (
            <CableTable
              filterWbs={selectedWbs}
              filterSistema={selectedSistema}
              filterCleanTipo={selectedTipoCable}
              filterTipoCable="CIRCUITO"
              onDataChanged={async () => {
                await fetchData();
              }}
            />
          )}
        </div>

        {/* ── Import Wizard Modal ── */}
        {showImportWizard && (
          <CableImportWizard
            forceType={importType}
            onClose={() => setShowImportWizard(false)}
            onImportComplete={handleImportComplete}
          />
        )}
      </div>
      );
}
