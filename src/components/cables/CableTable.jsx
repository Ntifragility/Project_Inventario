import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import {
  Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ArrowUpDown, Package
} from 'lucide-react';

/**
 * CableTable — Searchable, sortable, paginated detail table for cable circuits.
 * Shows cable schedule data with expandable rows to display despachos.
 *
 * Props:
 * - filterArea: string (active area filter)
 * - filterTipoServicio: string (active tipo servicio filter)
 */
export default function CableTable({ filterArea = '', filterTipoServicio = '' }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('tag_unico');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const [despachos, setDespachos] = useState([]);
  const [loadingDespachos, setLoadingDespachos] = useState(false);

  const PAGE_SIZE = 25;

  const COLUMNS = [
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

  // ══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════════

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('cable_schedule')
        .select('*', { count: 'exact' });

      if (filterArea) query = query.eq('area', filterArea);
      if (filterTipoServicio) query = query.eq('tipo_servicio', filterTipoServicio);
      if (search) {
        query = query.or(`tag_unico.ilike.%${search}%,tipo_cable.ilike.%${search}%,area.ilike.%${search}%,conexion_origen.ilike.%${search}%,conexion_destino.ilike.%${search}%`);
      }

      // Sort
      query = query.order(sortField, { ascending: sortDir === 'asc' });

      // Pagination
      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data: rows, error, count } = await query;
      if (error) throw error;

      setData(rows || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Cable table fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterArea, filterTipoServicio, search, sortField, sortDir, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [filterArea, filterTipoServicio, search]);

  // ── Fetch despachos for expanded row ──
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
    if (expandedRow === tagUnico) {
      setExpandedRow(null);
      setDespachos([]);
    } else {
      setExpandedRow(tagUnico);
      fetchDespachos(tagUnico);
    }
  };

  // ── Sort handler ──
  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ── Compute avance ──
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
      'Conectado Origen': 'status-badge status-partial',
      'Conectado Destino': 'status-badge status-partial',
      'Terminado': 'status-badge status-done',
    };
    return <span className={classes[estado] || 'status-badge'}>{estado || 'N/A'}</span>;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="cable-table-container">
      {/* Search */}
      <div className="cable-table-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Buscar por TAG, tipo de cable, área, conexión..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="cable-table-count">
          {totalCount.toLocaleString()} circuitos
        </span>
      </div>

      {/* Table */}
      <div className="cable-table-wrapper">
        <table className="cable-detail-table">
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              {COLUMNS.map(col => (
                <th
                  key={col.field}
                  style={{ width: col.width, textAlign: col.align || 'left' }}
                  className={col.computed ? '' : 'sortable'}
                  onClick={() => !col.computed && handleSort(col.field)}
                >
                  {col.label}
                  {sortField === col.field && !col.computed && (
                    <ArrowUpDown size={12} style={{ marginLeft: 4, opacity: 0.6 }} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="cable-table-loading">
                  Cargando...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="cable-table-empty">
                  No se encontraron circuitos. Importa un Cable Schedule para comenzar.
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const isExpanded = expandedRow === row.tag_unico;
                const avance = getAvance(row);

                return (
                  <React.Fragment key={row.tag_unico}>
                    <tr
                      className={`cable-table-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => toggleExpand(row.tag_unico)}
                    >
                      <td className="cable-expand-cell">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                      <td className="cable-tag-cell">{row.tag_unico}</td>
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
                    </tr>

                    {/* Expanded despachos */}
                    {isExpanded && (
                      <tr className="cable-despacho-row">
                        <td colSpan={COLUMNS.length + 1}>
                          <div className="cable-despacho-panel">
                            <h5><Package size={14} /> Despachos para {row.tag_unico}</h5>
                            {loadingDespachos ? (
                              <p className="text-muted">Cargando despachos...</p>
                            ) : despachos.length === 0 ? (
                              <p className="text-muted">Sin despachos registrados</p>
                            ) : (
                              <table className="cable-despacho-table">
                                <thead>
                                  <tr>
                                    <th>Vale Almacén</th>
                                    <th>Fecha Entrega</th>
                                    <th>Long. Despachada (m)</th>
                                    <th>Sector</th>
                                    <th>Solicitado Por</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {despachos.map((d, i) => (
                                    <tr key={d.id || i}>
                                      <td>{d.vale_almacen || '—'}</td>
                                      <td>{d.fecha_entrega || '—'}</td>
                                      <td style={{ textAlign: 'right' }}>
                                        {parseFloat(d.longitud_despachada_m || 0).toFixed(1)}
                                      </td>
                                      <td>{d.sector || '—'}</td>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="cable-table-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
