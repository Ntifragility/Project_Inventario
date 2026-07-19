import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import {
  RefreshCw, Upload, Package, Activity, Cable, Filter,
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

  // Filters
  const [areas, setAreas] = useState([]);
  const [tipoServicios, setTipoServicios] = useState([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedTipoServicio, setSelectedTipoServicio] = useState('');

  // KPI Data
  const [kpis, setKpis] = useState({
    longitudTotal: 0,
    circuitosTotales: 0,
    longitudTendida: 0,
    longitudPendiente: 0,
    circuitosPendientes: 0,
    tendidoPct: 0,
    conexOrigenPct: 0,
    conexDestinoPct: 0,
    conexOrigenPendientes: 0,
    conexDestinoPendientes: 0,
  });

  // Chart Data
  const [servicioBars, setServicioBars] = useState([]);
  const [areaBars, setAreaBars] = useState([]);

  // Detail table
  const [showTable, setShowTable] = useState(false);

  // ══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════════

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch all data from the dashboard view
      let query = supabase.from('v_cable_dashboard').select('*');

      if (selectedArea) {
        query = query.eq('area', selectedArea);
      }
      if (selectedTipoServicio) {
        query = query.eq('tipo_servicio', selectedTipoServicio);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      const rows = data || [];

      // ── Compute KPIs ──
      const longitudTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total_estimado_m) || 0), 0);
      const longitudTendida = rows.reduce((sum, r) => sum + (parseFloat(r.metrado_reportado_campo) || 0), 0);
      const longitudPendiente = rows.reduce((sum, r) => sum + (parseFloat(r.longitud_pendiente_m) || 0), 0);
      const circuitosTotales = rows.length;
      const circuitosPendientes = rows.filter(r => !r.is_tendido).length;
      const tendidoPct = longitudTotal > 0 ? (longitudTendida / longitudTotal) * 100 : 0;

      // Connection stats (for now, based on the is_tendido / estado field)
      // These will be refined when connection tracking is implemented
      const withConexOrigen = rows.filter(r => r.conexion_origen && r.is_tendido).length;
      const withConexDestino = rows.filter(r => r.conexion_destino && r.is_tendido).length;
      const totalWithOrigen = rows.filter(r => r.conexion_origen).length;
      const totalWithDestino = rows.filter(r => r.conexion_destino).length;

      setKpis({
        longitudTotal,
        circuitosTotales,
        longitudTendida,
        longitudPendiente,
        circuitosPendientes,
        tendidoPct,
        conexOrigenPct: totalWithOrigen > 0 ? (withConexOrigen / totalWithOrigen) * 100 : 0,
        conexDestinoPct: totalWithDestino > 0 ? (withConexDestino / totalWithDestino) * 100 : 0,
        conexOrigenPendientes: totalWithOrigen - withConexOrigen,
        conexDestinoPendientes: totalWithDestino - withConexDestino,
      });

      // ── Compute bar chart data by SERVICIO ──
      const servicioMap = new Map();
      rows.forEach(r => {
        const key = r.servicio || 'Sin Servicio';
        if (!servicioMap.has(key)) servicioMap.set(key, { tendido: 0, porTender: 0 });
        const entry = servicioMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setServicioBars(
        Array.from(servicioMap.entries()).map(([name, v]) => ({
          name,
          tendido: v.tendido,
          porTender: v.porTender,
          total: v.tendido + v.porTender,
        }))
      );

      // ── Compute bar chart data by AREA ──
      const areaMap = new Map();
      rows.forEach(r => {
        const key = r.area || 'Sin Área';
        if (!areaMap.has(key)) areaMap.set(key, { tendido: 0, porTender: 0 });
        const entry = areaMap.get(key);
        entry.tendido += parseFloat(r.metrado_reportado_campo) || 0;
        entry.porTender += parseFloat(r.longitud_pendiente_m) || 0;
      });
      setAreaBars(
        Array.from(areaMap.entries()).map(([name, v]) => ({
          name,
          tendido: v.tendido,
          porTender: v.porTender,
          total: v.tendido + v.porTender,
        }))
      );

    } catch (err) {
      console.error('Cable dashboard error:', err);
      setError('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedArea, selectedTipoServicio]);

  // Fetch filter options
  const fetchFilters = useCallback(async () => {
    try {
      const { data: areaData } = await supabase
        .from('cable_schedule')
        .select('area')
        .not('area', 'is', null)
        .order('area');

      const { data: tipoData } = await supabase
        .from('cable_schedule')
        .select('tipo_servicio')
        .not('tipo_servicio', 'is', null)
        .order('tipo_servicio');

      setAreas([...new Set((areaData || []).map(r => r.area).filter(Boolean))]);
      setTipoServicios([...new Set((tipoData || []).map(r => r.tipo_servicio).filter(Boolean))]);
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
    if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
    return n.toFixed(1);
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
            <label>Área</label>
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
            >
              <option value="">Todas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="cable-filter-group">
            <label>Tipo Servicio</label>
            <select
              value={selectedTipoServicio}
              onChange={e => setSelectedTipoServicio(e.target.value)}
            >
              <option value="">Todos</option>
              {tipoServicios.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
        <div className="cable-actions">
          <button className="btn btn-primary btn-sm" onClick={() => openImport('schedule')}>
            <Upload size={14} /> Importar Schedule
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => openImport('despacho')}>
            <Package size={14} /> Importar Despachos
          </button>
        </div>
      </div>

      {error && (
        <div className="message danger" style={{ margin: '0 0 16px 0' }}>
          <span>{error}</span>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="cable-kpi-row">
        <div className="cable-kpi-card">
          <span className="cable-kpi-value accent">{formatNumber(kpis.longitudTotal)}</span>
          <span className="cable-kpi-label">Longitud Total (m)</span>
        </div>
        <div className="cable-kpi-card">
          <span className="cable-kpi-value accent">{kpis.circuitosTotales.toLocaleString()}</span>
          <span className="cable-kpi-label">Circuitos Totales</span>
        </div>
        <div className="cable-kpi-card highlight">
          <CableGauge
            value={kpis.tendidoPct}
            label="TENDIDO"
            size={130}
            strokeWidth={10}
            color="#f59e0b"
            bgColor="rgba(255,255,255,0.08)"
            type="donut"
          />
        </div>
        <div className="cable-kpi-card">
          <span className="cable-kpi-value warning">{formatNumber(kpis.longitudPendiente)}</span>
          <span className="cable-kpi-label">Longitud Pendiente</span>
          <div className="cable-kpi-sub">
            <span className="cable-kpi-sub-value">{kpis.circuitosPendientes.toLocaleString()}</span>
            <span className="cable-kpi-sub-label">Circuitos Pendientes</span>
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="cable-charts-row">
        <div className="cable-chart-col">
          <CableBarChart
            data={servicioBars}
            title="Longitud de Cable (m) según Servicio"
          />
        </div>
        <div className="cable-chart-col">
          <CableBarChart
            data={areaBars}
            title="Longitud de Cable (m) según Área"
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
            filterArea={selectedArea}
            filterTipoServicio={selectedTipoServicio}
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
