import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabase';
import {
  RefreshCw, Upload, Package, Activity, Cable, Filter, FilterX,
  ChevronDown, Search, Download
} from 'lucide-react';
import CableGauge from './CableGauge';
import CableBarChart from './CableBarChart';
import CableImportWizard from './CableImportWizard';
import CableTable from './CableTable';

/**
 * CableDashboard — Main view for the Cable Schedule Manager.
 * Displays KPIs, charts, gauges, and a detail table matching the reference dashboard.
 */
export default function CableDashboard() {
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
      // One-time database cleanup to remove existing non-cable items (e.g., SOLDADURA)
      await supabase
        .from('cable_schedule')
        .delete()
        .not('material', 'ilike', 'CABLE%');

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
          .eq('tipo_cable', 'CIRCUITO')
          .ilike('material', 'CABLE%');

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

      const processedRows = rawRows.map(r => {
        const total = parseFloat(r.total_estimado_m) || 0;
        const metrado = parseFloat(r.metrado_reportado_campo) || 0;
        const materialStr = r.material || '';
        const cleanTipo = materialStr.replace(/^cable\s+/i, '').trim().toUpperCase();
        const despachado = despMap.get(r.tag_unico) || 0;
        return {
          ...r,
          longitud_despachada_m: despachado,
          longitud_pendiente_m: Math.max(0, total - metrado),
          is_tendido: metrado >= total && total > 0,
          tipo_cable_clean: cleanTipo || 'SIN TIPO'
        };
      });

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

      // ── Compute KPIs ──
      const longitudTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total_estimado_m) || 0), 0);
      const longitudTendida = rows.reduce((sum, r) => sum + (parseFloat(r.metrado_reportado_campo) || 0), 0);
      const longitudPendiente = rows.reduce((sum, r) => sum + (parseFloat(r.longitud_pendiente_m) || 0), 0);
      const longitudDespachada = rows.reduce((sum, r) => sum + (parseFloat(r.longitud_despachada_m) || 0), 0);
      const circuitosTotales = rows.length;
      const circuitosPendientes = rows.filter(r => !r.is_tendido).length;
      const tendidoPct = longitudTotal > 0 ? (longitudTendida / longitudTotal) * 100 : 0;
      const despachadoPct = longitudTotal > 0 ? (longitudDespachada / longitudTotal) * 100 : 0;
      const desviacionAlmacen = longitudDespachada - longitudTendida;
      const circuitosDesviados = rows.filter(r => r.longitud_despachada_m > r.metrado_reportado_campo).length;

      // Connection stats (for now, based on the is_tendido / estado field)
      // These will be refined when connection tracking is implemented
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
        longitudPendiente,
        circuitosPendientes,
        tendidoPct,
        longitudDespachada,
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
        if (!tipoMap.has(key)) tipoMap.set(key, { tendido: 0, porTender: 0 });
        const entry = tipoMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setTipoBars(
        [...tipoMap.entries()].map(([name, val]) => ({
          name,
          tendido: val.tendido,
          porTender: val.porTender,
          total: val.tendido + val.porTender,
        }))
      );

      // ── Compute bar chart data by WBS ──
      const wbsMap = new Map();
      rows.forEach(r => {
        const key = r.wbs || 'SIN WBS';
        if (!wbsMap.has(key)) wbsMap.set(key, { tendido: 0, porTender: 0 });
        const entry = wbsMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setWbsBars(
        [...wbsMap.entries()].map(([name, val]) => ({
          name,
          tendido: val.tendido,
          porTender: val.porTender,
          total: val.tendido + val.porTender,
        }))
      );

      // ── Compute bar chart data by SISTEMA ──
      const sisMap = new Map();
      rows.forEach(r => {
        const key = r.sistema || 'SIN SISTEMA';
        if (!sisMap.has(key)) sisMap.set(key, { tendido: 0, porTender: 0 });
        const entry = sisMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setSistemaBars(
        [...sisMap.entries()].map(([name, val]) => ({
          name,
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
  }, [selectedWbs, selectedSistema, selectedTipoCable]);

  // Fetch filter options once on mount
  const fetchFilters = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('cable_schedule')
        .select('wbs, sistema, material')
        .eq('tipo_cable', 'CIRCUITO')
        .ilike('material', 'CABLE%');

      setRawFiltersData(data || []);
    } catch (err) {
      console.error('Error fetching filters:', err);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
    fetchData();
  }, [fetchData, fetchFilters]);

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  const formatNumber = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
    return Math.round(n).toLocaleString();
  };

  const openImport = (type) => {
    setImportType(type);
    setShowImportWizard(true);
  };

  const handleImportComplete = () => {
    setShowImportWizard(false);
    fetchData();
    fetchFilters();
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div id="cable-dashboard" className="tab-content active">
      {/* ── Top Bar: Filters + Actions ── */}
      <div className="cable-topbar">
        <div className="cable-filters">
          <div className="cable-filter-group">
            <label>Tipo de Cable</label>
            <select
              value={selectedTipoCable}
              onChange={e => setSelectedTipoCable(e.target.value)}
            >
              <option value="">Todos</option>
              {filteredTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="cable-filter-group">
            <label>WBS</label>
            <select
              value={selectedWbs}
              onChange={e => setSelectedWbs(e.target.value)}
            >
              <option value="">Todos</option>
              {filteredWbs.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="cable-filter-group">
            <label>Sistema</label>
            <select
              value={selectedSistema}
              onChange={e => setSelectedSistema(e.target.value)}
            >
              <option value="">Todos</option>
              {filteredSistemas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading} title="Actualizar datos">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
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

        {/* ── Charts Row ── */}
        <div className="cable-charts-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 300px', gap: '16px', marginBottom: '20px' }}>
          <div className="cable-chart-col">
            <CableBarChart
              data={tipoBars}
              title="Longitud de Cable (m) según Tipo"
            />
          </div>
          <div className="cable-chart-col">
            <CableBarChart
              data={wbsBars}
              title="Longitud de Cable (m) según WBS"
            />
          </div>
          <div className="cable-chart-col">
            <CableBarChart
              data={sistemaBars}
              title="Longitud de Cable (m) según Sistema"
            />
          </div>
          <div className="cable-chart-col cable-gauges-col">
            <div className="cable-gauges-card">
              <CableGauge
                value={kpis.conexOrigenPct}
                label="CONEX. ORIGEN"
                sublabel={kpis.conexOrigenPendientes.toLocaleString()}
                size={140}
                strokeWidth={10}
                color={kpis.conexOrigenPct > 50 ? '#10b981' : '#ef4444'}
                bgColor="rgba(255,255,255,0.08)"
                type="semi"
              />
              <CableGauge
                value={kpis.conexDestinoPct}
                label="CONEX. DESTINO"
                sublabel={kpis.conexDestinoPendientes.toLocaleString()}
                size={140}
                strokeWidth={10}
                color={kpis.conexDestinoPct > 50 ? '#10b981' : '#ef4444'}
                bgColor="rgba(255,255,255,0.08)"
                type="semi"
              />
              <div className="cable-gauges-footer">
                <span>CIRCUITOS PENDIENTES</span>
                <div className="cable-gauges-footer-values">
                  <span>{kpis.conexOrigenPendientes.toLocaleString()}</span>
                  <span>{kpis.conexDestinoPendientes.toLocaleString()}</span>
                </div>
              </div>
            </div>
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
