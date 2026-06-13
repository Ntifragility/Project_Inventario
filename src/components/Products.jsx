import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { Plus, Upload, List, AlertCircle, CheckCircle2, Info } from 'lucide-react';

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
  const [submitting, setSubmitting] = useState(false);

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

  // CSV Import handler
  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setCsvMsg({ text: 'Procesando archivo CSV...', type: 'info' });

    const reader = new FileReader();
    reader.onload = async function(e) {
      const text = e.target.result;
      const lines = text.split(/\r?\n/);
      
      if (lines.length < 2) {
        setCsvMsg({ text: 'El archivo CSV está vacío o no contiene suficientes filas.', type: 'error' });
        event.target.value = '';
        return;
      }

      const headerLine = lines[0];
      let delimiter = ',';
      if (headerLine.includes(';')) {
        delimiter = ';';
      }

      const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase());
      const colCodigo = headers.indexOf('id producto');
      const colNombre = headers.indexOf('producto');
      const colUnidad = headers.indexOf('unidad');
      const colGrupo = headers.indexOf('grupo');
      const colStockMin = headers.findIndex(h => h === 'stock mín.' || h === 'stock min.' || h === 'stock min' || h === 'stock mín');

      if (colCodigo === -1 || colNombre === -1 || colUnidad === -1 || colGrupo === -1 || colStockMin === -1) {
        setCsvMsg({ text: 'Formato CSV incorrecto. Debe incluir: "ID Producto", "Producto", "Unidad", "Grupo", y "Stock Mín.".', type: 'error' });
        event.target.value = '';
        return;
      }

      try {
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

        const splitRegex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const cols = line.split(splitRegex).map(c => c.trim().replace(/^"|"$/g, ''));

          if (cols.length <= Math.max(colCodigo, colNombre)) {
            emptyCount++;
            continue;
          }

          const codigoVal = cols[colCodigo]?.trim().toUpperCase();
          const nombreVal = cols[colNombre]?.trim();

          if (!codigoVal || !nombreVal) {
            emptyCount++;
            continue;
          }

          if (existingCodes.has(codigoVal)) {
            skippedCount++;
            continue;
          }

          let unidadId = defaultUnidadId;
          if (colUnidad !== -1 && cols[colUnidad]) {
            const uName = cols[colUnidad].trim().toLowerCase();
            if (unidadesMap.has(uName)) unidadId = unidadesMap.get(uName);
          }

          let grupoId = defaultGrupoId;
          if (colGrupo !== -1 && cols[colGrupo]) {
            const gName = cols[colGrupo].trim().toLowerCase();
            if (gruposMap.has(gName)) grupoId = gruposMap.get(gName);
          }

          let stockMinVal = 0;
          if (colStockMin !== -1 && cols[colStockMin]) {
            const parsedStock = parseInt(cols[colStockMin]);
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
        console.error('Error importing CSV:', err);
        setCsvMsg({ text: 'Error al importar: ' + err.message, type: 'error' });
        event.target.value = '';
      }
    };

    reader.readAsText(file, 'UTF-8');
  };

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

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Upload size={18} />
            <span>Importar Productos desde CSV</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Seleccione un archivo CSV para registrar múltiples productos en lote. El archivo debe incluir las
            cabeceras: <strong>ID Producto</strong>, <strong>Producto</strong>, <strong>Unidad</strong>, <strong>Grupo</strong>, y <strong>Stock Mín.</strong>
          </p>
          <div className="actions">
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              <Upload size={16} />
              <span>Seleccionar Archivo CSV</span>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleImportCSV} 
                style={{ display: 'none' }} 
              />
            </label>
          </div>

          {csvMsg.text && (
            <div className={`message ${csvMsg.type}`}>
              {csvMsg.type === 'info' ? <Info size={16} /> : csvMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{csvMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <List size={18} />
            <span>Productos Registrados</span>
          </div>
        </div>
        <div className="card-body">
          {loadingList ? (
            <div className="loading-container">
              <span className="spinner"></span>
              <span>Cargando lista de productos...</span>
            </div>
          ) : productsList.length === 0 ? (
            <div className="message warning">No hay productos registrados en el sistema.</div>
          ) : (
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
                  </tr>
                </thead>
                <tbody>
                  {productsList.map((p) => {
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
