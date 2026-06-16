import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { Plus, Upload, List, AlertCircle, CheckCircle2, Info, Pencil, Trash2, X, Save, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Products() {
  // Form states
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('');
  const [grupo, setGrupo] = useState('');
  const [stockMin, setStockMin] = useState(0);

  // Dropdown option states
  const [unidadesList, setUnidadesList] = useState([]);
  const [gruposList, setGruposList] = useState([]);

  // Lists & UI status states
  const [productsList, setProductsList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [formMsg, setFormMsg] = useState({ text: '', type: '' });
  const [csvMsg, setCsvMsg] = useState({ text: '', type: '' });
  const [showImportModal, setShowImportModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit mode states (FUNC-1)
  const [editingProduct, setEditingProduct] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editUnidad, setEditUnidad] = useState('');
  const [editGrupo, setEditGrupo] = useState('');
  const [editStockMin, setEditStockMin] = useState(0);
  const [editMsg, setEditMsg] = useState({ text: '', type: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete confirmation states (FUNC-1)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMsg, setDeleteMsg] = useState({ text: '', type: '' });
  const [deleting, setDeleting] = useState(false);

  // Pagination state (FUNC-2)
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [filterText, setFilterText] = useState('');

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText]);

  // Fetch lists (unidades, grupos)
  const fetchListas = useCallback(async () => {
    try {
      const [resUnidades, resGrupos] = await Promise.all([
        supabase.from('unidades').select('nombre').order('nombre'),
        supabase.from('grupos').select('nombre').order('nombre')
      ]);

      if (resUnidades.error) throw resUnidades.error;
      if (resGrupos.error) throw resGrupos.error;

      setUnidadesList(resUnidades.data || []);
      setGruposList(resGrupos.data || []);

      if (resUnidades.data?.length > 0) setUnidad(resUnidades.data[0].nombre);
      if (resGrupos.data?.length > 0) setGrupo(resGrupos.data[0].nombre);
    } catch (err) {
      console.error('Error loading dropdown lists:', err);
    }
  }, []);

  // Fetch registered products
  const fetchProducts = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('v_productos_stock')
        .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad')
        .order('nombre');

      if (error) throw error;
      setProductsList(data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error listing products:', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchListas();
    fetchProducts();
  }, [fetchListas, fetchProducts]);

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormMsg({ text: '', type: '' });

    const codeClean = codigo.trim().toUpperCase();
    const nameClean = nombre.trim();

    if (!codeClean || !nameClean) {
      setFormMsg({ text: 'Código y nombre son obligatorios.', type: 'error' });
      return;
    }

    // Input length validation (SEC-5)
    if (codeClean.length > 50) {
      setFormMsg({ text: 'El código no puede exceder 50 caracteres.', type: 'error' });
      return;
    }
    if (nameClean.length > 255) {
      setFormMsg({ text: 'El nombre no puede exceder 255 caracteres.', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      // Find unit and group IDs
      const [resUnit, resGroup] = await Promise.all([
        supabase.from('unidades').select('id').eq('nombre', unidad).single(),
        supabase.from('grupos').select('id').eq('nombre', grupo).single()
      ]);

      if (resUnit.error) throw resUnit.error;
      if (resGroup.error) throw resGroup.error;

      const { error } = await supabase.from('productos').insert([{
        codigo: codeClean,
        nombre: nameClean,
        unidad_id: resUnit.data.id,
        grupo_id: resGroup.data.id,
        stock_min: parseInt(stockMin) || 0
      }]);

      if (error) {
        if (error.code === '23505') {
          setFormMsg({ text: 'Ya existe un producto con este código.', type: 'error' });
        } else {
          throw error;
        }
        return;
      }

      setFormMsg({ text: 'Producto registrado correctamente.', type: 'success' });
      setCodigo('');
      setNombre('');
      setStockMin(0);
      fetchProducts();
    } catch (err) {
      console.error('Error inserting product:', err);
      setFormMsg({ text: 'Error al registrar: ' + err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── FUNC-1: Edit product ──
  const handleStartEdit = (product) => {
    setEditingProduct(product);
    setEditNombre(product.nombre);
    setEditUnidad(product.unidad);
    setEditGrupo(product.grupo);
    setEditStockMin(product.stockMin);
    setEditMsg({ text: '', type: '' });
  };

  const handleSaveEdit = async () => {
    const nameClean = editNombre.trim();
    if (!nameClean) {
      setEditMsg({ text: 'El nombre es obligatorio.', type: 'error' });
      return;
    }
    if (nameClean.length > 255) {
      setEditMsg({ text: 'El nombre no puede exceder 255 caracteres.', type: 'error' });
      return;
    }

    setEditSubmitting(true);
    try {
      const [resUnit, resGroup] = await Promise.all([
        supabase.from('unidades').select('id').eq('nombre', editUnidad).single(),
        supabase.from('grupos').select('id').eq('nombre', editGrupo).single()
      ]);

      if (resUnit.error) throw resUnit.error;
      if (resGroup.error) throw resGroup.error;

      const { error } = await supabase
        .from('productos')
        .update({
          nombre: nameClean,
          unidad_id: resUnit.data.id,
          grupo_id: resGroup.data.id,
          stock_min: parseInt(editStockMin) || 0
        })
        .eq('codigo', editingProduct.codigo);

      if (error) throw error;

      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      console.error('Error updating product:', err);
      setEditMsg({ text: 'Error al actualizar: ' + err.message, type: 'error' });
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── FUNC-1: Delete product ──
  const handleStartDelete = (product) => {
    setDeleteTarget(product);
    setDeleteMsg({ text: '', type: '' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteMsg({ text: '', type: '' });

    try {
      // Check for associated movements
      const { count, error: countErr } = await supabase
        .from('movimientos')
        .select('id', { count: 'exact', head: true })
        .eq('producto_codigo', deleteTarget.codigo);

      if (countErr) throw countErr;

      if (count > 0) {
        setDeleteMsg({ 
          text: `Este producto tiene ${count} movimiento(s) asociado(s). Al eliminarlo, también se eliminarán todos sus movimientos (CASCADE). ¿Desea continuar?`, 
          type: 'warning' 
        });
        // Switch to a "force delete" flow
        setDeleting(false);
        return;
      }

      await executeDelete();
    } catch (err) {
      console.error('Error checking movements:', err);
      setDeleteMsg({ text: 'Error al verificar: ' + err.message, type: 'error' });
      setDeleting(false);
    }
  };

  const executeDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('codigo', deleteTarget.codigo);

      if (error) throw error;

      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      console.error('Error deleting product:', err);
      setDeleteMsg({ text: 'Error al eliminar: ' + err.message, type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // Excel / CSV Import handler
  const handleImportExcelCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setCsvMsg({ text: 'Procesando archivo...', type: 'info' });

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays (header: 1)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rows.length < 2) {
          setCsvMsg({ text: 'El archivo está vacío o no contiene suficientes filas.', type: 'error' });
          event.target.value = '';
          return;
        }

        const rawHeaders = rows[0];
        const normalize = (str) => {
          return String(str || '')
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, '');
        };

        const normHeaders = rawHeaders.map(normalize);
        const colCodigo = normHeaders.indexOf(normalize('ID Producto'));
        const colNombre = normHeaders.indexOf(normalize('Producto'));
        const colUnidad = normHeaders.indexOf(normalize('Unidad'));
        const colGrupo = normHeaders.indexOf(normalize('Grupo'));
        
        // Find stock min index
        const colStockMin = normHeaders.findIndex(h => 
          h === normalize('Stock Mín.') || 
          h === normalize('Stock Mín') || 
          h === normalize('Stock Min.') || 
          h === normalize('Stock Min')
        );

        if (colCodigo === -1 || colNombre === -1 || colUnidad === -1 || colGrupo === -1 || colStockMin === -1) {
          setCsvMsg({ text: 'Formato incorrecto. Debe incluir las cabeceras: "ID Producto", "Producto", "Unidad", "Grupo", y "Stock Mín.".', type: 'error' });
          event.target.value = '';
          return;
        }

        const [resUnidades, resGrupos, resProductos] = await Promise.all([
          supabase.from('unidades').select('id, nombre'),
          supabase.from('grupos').select('id, nombre'),
          supabase.from('productos').select('codigo')
        ]);

        if (resUnidades.error) throw resUnidades.error;
        if (resGrupos.error) throw resGrupos.error;
        if (resProductos.error) throw resProductos.error;

        const unidadesMap = new Map(resUnidades.data.map(u => [u.nombre.trim().toLowerCase(), u.id]));
        const gruposMap = new Map(resGrupos.data.map(g => [g.nombre.trim().toLowerCase(), g.id]));
        const existingCodes = new Set(resProductos.data.map(p => p.codigo.trim().toUpperCase()));

        const defaultUnidadId = unidadesMap.get('unidades') || (resUnidades.data[0] ? resUnidades.data[0].id : null);
        const defaultGrupoId = gruposMap.get('general') || (resGrupos.data[0] ? resGrupos.data[0].id : null);

        const productsToInsert = [];
        let skippedCount = 0;
        let emptyCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const codigoRaw = row[colCodigo];
          const nombreRaw = row[colNombre];

          if (codigoRaw === undefined || codigoRaw === null || nombreRaw === undefined || nombreRaw === null) {
            emptyCount++;
            continue;
          }

          const codigoVal = String(codigoRaw).trim().toUpperCase();
          const nombreVal = String(nombreRaw).trim();

          if (!codigoVal || !nombreVal) {
            emptyCount++;
            continue;
          }

          // Input length validation (SEC-5)
          if (codigoVal.length > 50 || nombreVal.length > 255) {
            emptyCount++;
            continue;
          }

          if (existingCodes.has(codigoVal)) {
            skippedCount++;
            continue;
          }

          let unidadId = defaultUnidadId;
          const umRaw = row[colUnidad];
          if (umRaw !== undefined && umRaw !== null) {
            const uName = String(umRaw).trim().toLowerCase();
            if (unidadesMap.has(uName)) unidadId = unidadesMap.get(uName);
          }

          let grupoId = defaultGrupoId;
          const gRaw = row[colGrupo];
          if (gRaw !== undefined && gRaw !== null) {
            const gName = String(gRaw).trim().toLowerCase();
            if (gruposMap.has(gName)) grupoId = gruposMap.get(gName);
          }

          let stockMinVal = 0;
          const smRaw = row[colStockMin];
          if (smRaw !== undefined && smRaw !== null) {
            const parsedStock = parseInt(smRaw);
            if (!isNaN(parsedStock) && parsedStock >= 0) stockMinVal = parsedStock;
          }

          productsToInsert.push({
            codigo: codigoVal,
            nombre: nombreVal,
            unidad_id: unidadId,
            grupo_id: grupoId,
            stock_min: stockMinVal
          });
        }

        if (productsToInsert.length === 0) {
          let msg = 'No se importó ningún producto nuevo.';
          if (skippedCount > 0) msg += ` (${skippedCount} ya existían).`;
          setCsvMsg({ text: msg, type: 'warning' });
          event.target.value = '';
          return;
        }

        const { error: insertErr } = await supabase.from('productos').insert(productsToInsert);
        if (insertErr) throw insertErr;

        setCsvMsg({ 
          text: `Importación exitosa: se registraron ${productsToInsert.length} productos. (${skippedCount} omitidos por duplicados, ${emptyCount} filas vacías).`, 
          type: 'success' 
        });

        event.target.value = '';
        fetchProducts();
      } catch (err) {
        console.error('Error importing Excel/CSV:', err);
        setCsvMsg({ text: 'Error al importar: ' + err.message, type: 'error' });
        event.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Client-side search filtering
  const filteredProducts = productsList.filter(p => {
    const cleanFilter = filterText.toLowerCase();
    return (
      p.codigo?.toLowerCase().includes(cleanFilter) ||
      p.nombre?.toLowerCase().includes(cleanFilter) ||
      p.grupo?.toLowerCase().includes(cleanFilter)
    );
  });

  // Pagination computed values (FUNC-2)
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIdx = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedData = filteredProducts.slice(startIdx, startIdx + rowsPerPage);

  return (
    <div id="productos" className="tab-content active">
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Plus size={18} />
            <span>Registrar Nuevo Producto</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="codigoProd">ID Producto *</label>
                <input 
                  type="text" 
                  id="codigoProd" 
                  placeholder="ID único del producto" 
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  maxLength={50}
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="nombreProd">Producto *</label>
                <input 
                  type="text" 
                  id="nombreProd" 
                  placeholder="Nombre del producto" 
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  maxLength={255}
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="unidadProd">Unidad</label>
                <select 
                  id="unidadProd" 
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  required
                >
                  {unidadesList.map((u) => (
                    <option key={u.nombre} value={u.nombre}>{u.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="grupoProd">Grupo</label>
                <select 
                  id="grupoProd" 
                  value={grupo}
                  onChange={(e) => setGrupo(e.target.value)}
                  required
                >
                  {gruposList.map((g) => (
                    <option key={g.nombre} value={g.nombre}>{g.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="stockMinProd">Stock Mínimo</label>
                <input 
                  type="number" 
                  id="stockMinProd" 
                  min="0" 
                  value={stockMin}
                  onChange={(e) => setStockMin(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className="actions">
              <button type="submit" className="btn btn-success" disabled={submitting}>
                <Plus size={16} />
                <span>Registrar Producto</span>
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setCodigo('');
                  setNombre('');
                  setStockMin(0);
                  setFormMsg({ text: '', type: '' });
                }}
              >
                Limpiar
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => setShowImportModal(true)}
              >
                <Upload size={16} />
                <span>Importar desde Excel / CSV</span>
              </button>
            </div>
          </form>

          {formMsg.text && (
            <div className={`message ${formMsg.type}`}>
              {formMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{formMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} style={{ color: 'var(--primary)' }} />
                <span>Importar Productos desde Excel / CSV</span>
              </div>
              <button 
                onClick={() => {
                  setShowImportModal(false);
                  setCsvMsg({ text: '', type: '' });
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                Seleccione un archivo Excel (.xlsx, .xls) o CSV (.csv) para registrar múltiples productos en lote. El archivo debe incluir las cabeceras: <strong>ID Producto</strong>, <strong>Producto</strong>, <strong>Unidad</strong>, <strong>Grupo</strong>, y <strong>Stock Mín.</strong>
              </p>
              <div className="actions" style={{ marginBottom: 0 }}>
                <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                  <Upload size={16} />
                  <span>Seleccionar archivo</span>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    onChange={handleImportExcelCSV} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>

              {csvMsg.text && (
                <div className={`message ${csvMsg.type}`} style={{ margin: '16px 0 0 0' }}>
                  {csvMsg.type === 'info' ? <Info size={16} /> : csvMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{csvMsg.text}</span>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 24px', background: 'var(--bg-card-header)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowImportModal(false);
                  setCsvMsg({ text: '', type: '' });
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <List size={18} />
            <span>Productos Registrados</span>
          </div>
        </div>
        <div className="card-body">
          {!loadingList && productsList.length > 0 && (
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
          )}

          {loadingList ? (
            <div className="loading-container">
              <span className="spinner"></span>
              <span>Cargando lista de productos...</span>
            </div>
          ) : productsList.length === 0 ? (
            <div className="message warning">No hay productos registrados en el sistema.</div>
          ) : filteredProducts.length === 0 ? (
            <div className="message warning">No se encontraron productos con el filtro especificado.</div>
          ) : (
            <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID Producto</th>
                    <th>Producto</th>
                    <th>Unidad</th>
                    <th>Grupo</th>
                    <th>Stock Mín.</th>
                    <th>Stock Actual</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((p) => {
                    let statusClass = 'status-normal';
                    if (p.cantidad <= 0) statusClass = 'status-zero';
                    else if (p.cantidad <= p.stockMin && p.stockMin > 0) statusClass = 'status-low';

                    return (
                      <tr key={p.codigo} className={statusClass}>
                        <td><strong>{p.codigo}</strong></td>
                        <td>{p.nombre}</td>
                        <td>{p.unidad}</td>
                        <td>{p.grupo}</td>
                        <td>{p.stockMin}</td>
                        <td>{p.cantidad}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                              onClick={() => handleStartEdit(p)}
                              title="Editar producto"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                              onClick={() => handleStartDelete(p)}
                              title="Eliminar producto"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
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
                  <span>Mostrando {startIdx + 1}–{Math.min(startIdx + rowsPerPage, filteredProducts.length)} de {filteredProducts.length}</span>
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

      {/* Edit Product Modal (FUNC-1) */}
      {editingProduct && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={16} style={{ color: 'var(--primary)' }} />
                <span>Editar Producto: {editingProduct.codigo}</span>
              </div>
              <button 
                onClick={() => setEditingProduct(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                disabled={editSubmitting}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Nombre *</label>
                  <input
                    type="text"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    maxLength={255}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Unidad</label>
                  <select value={editUnidad} onChange={(e) => setEditUnidad(e.target.value)}>
                    {unidadesList.map((u) => (
                      <option key={u.nombre} value={u.nombre}>{u.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Grupo</label>
                  <select value={editGrupo} onChange={(e) => setEditGrupo(e.target.value)}>
                    {gruposList.map((g) => (
                      <option key={g.nombre} value={g.nombre}>{g.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Stock Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    value={editStockMin}
                    onChange={(e) => setEditStockMin(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
              </div>

              {editMsg.text && (
                <div className={`message ${editMsg.type}`} style={{ marginTop: '16px' }}>
                  <AlertCircle size={16} />
                  <span>{editMsg.text}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setEditingProduct(null)} 
                  disabled={editSubmitting}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleSaveEdit} 
                  disabled={editSubmitting}
                >
                  <Save size={16} />
                  <span>{editSubmitting ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (FUNC-1) */}
      {deleteTarget && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '480px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={16} style={{ color: 'var(--danger)' }} />
                <span>Eliminar Producto</span>
              </div>
              <button 
                onClick={() => setDeleteTarget(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                disabled={deleting}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <p style={{ color: 'var(--text-primary)', marginBottom: '16px', lineHeight: '1.6' }}>
                ¿Está seguro de que desea eliminar el producto <strong>{deleteTarget.codigo}</strong> ({deleteTarget.nombre})?
              </p>

              {deleteMsg.text && (
                <div className={`message ${deleteMsg.type}`} style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} />
                  <span>{deleteMsg.text}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setDeleteTarget(null)} 
                  disabled={deleting}
                >
                  Cancelar
                </button>
                {deleteMsg.type === 'warning' ? (
                  <button 
                    className="btn btn-danger" 
                    onClick={executeDelete} 
                    disabled={deleting}
                  >
                    <Trash2 size={14} />
                    <span>{deleting ? 'Eliminando...' : 'Eliminar de Todos Modos'}</span>
                  </button>
                ) : (
                  <button 
                    className="btn btn-danger" 
                    onClick={handleConfirmDelete} 
                    disabled={deleting}
                  >
                    <Trash2 size={14} />
                    <span>{deleting ? 'Verificando...' : 'Confirmar Eliminación'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
