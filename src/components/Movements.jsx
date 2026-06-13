import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Save, Upload, AlertCircle, CheckCircle2, Info } from 'lucide-react';

export default function Movements({ user }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState('INGRESO');
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  
  // Autocomplete states
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [codigoReadOnly, setCodigoReadOnly] = useState(false);
  const [nombreReadOnly, setNombreReadOnly] = useState(false);
  const [codigoSuggestions, setCodigoSuggestions] = useState([]);
  const [nombreSuggestions, setNombreSuggestions] = useState([]);
  const [showCodigoDropdown, setShowCodigoDropdown] = useState(false);
  const [showNombreDropdown, setShowNombreDropdown] = useState(false);

  // Manual key input
  const [transactionKey, setTransactionKey] = useState('Automatico');
  
  // Messages and submitting
  const [formMsg, setFormMsg] = useState({ text: '', type: '' });
  const [csvMsg, setCsvMsg] = useState({ text: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  const autocompleteTimeout = useRef(null);

  // Helper to generate transaction keys
  const generateDispatchKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randStr = (length) => {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    return `${randStr(10)}-${randStr(3)}-${randStr(2)}`;
  };

  const generateUniqueMovementKey = async () => {
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const key = generateDispatchKey();
      const { data, error } = await supabase
        .from('movimientos')
        .select('id')
        .eq('key', key);
      if (error) throw error;
      if (!data || data.length === 0) {
        return key;
      }
    }
    throw new Error('No se pudo generar una clave única de transacción.');
  };

  // Autocomplete prefix query for Code
  const handleCodigoChange = (val) => {
    setCodigo(val);
    setNombre('');
    setNombreReadOnly(true);
    setShowCodigoDropdown(false);

    if (autocompleteTimeout.current) clearTimeout(autocompleteTimeout.current);

    const cleanVal = val.trim().toUpperCase();
    if (!cleanVal) {
      setNombreReadOnly(false);
      return;
    }

    autocompleteTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('v_productos_stock')
          .select('codigo, nombre, unidad, grupo')
          .ilike('codigo', `${cleanVal}%`)
          .limit(8);

        if (error) throw error;
        setCodigoSuggestions(data || []);
        setShowCodigoDropdown(data?.length > 0);
      } catch (err) {
        console.error('Autocomplete code query error:', err);
      }
    }, 200);
  };

  // Autocomplete substring query for Name
  const handleNombreChange = (val) => {
    setNombre(val);
    setCodigo('');
    setCodigoReadOnly(true);
    setShowNombreDropdown(false);

    if (autocompleteTimeout.current) clearTimeout(autocompleteTimeout.current);

    const cleanVal = val.trim();
    if (!cleanVal) {
      setCodigoReadOnly(false);
      return;
    }

    autocompleteTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('v_productos_stock')
          .select('codigo, nombre, unidad, grupo')
          .ilike('nombre', `%${cleanVal}%`)
          .limit(8);

        if (error) throw error;
        setNombreSuggestions(data || []);
        setShowNombreDropdown(data?.length > 0);
      } catch (err) {
        console.error('Autocomplete name query error:', err);
      }
    }, 200);
  };

  const handleSelectProduct = (product) => {
    setCodigo(product.codigo);
    setNombre(product.nombre);
    setCodigoReadOnly(false);
    setNombreReadOnly(false);
    setShowCodigoDropdown(false);
    setShowNombreDropdown(false);
  };

  // Dynamic input reset helpers
  const handleCodigoFocus = () => {
    setCodigoReadOnly(false);
    setNombreReadOnly(true);
    setNombre('');
  };

  const handleNombreFocus = () => {
    setNombreReadOnly(false);
    setCodigoReadOnly(true);
    setCodigo('');
  };

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormMsg({ text: '', type: '' });

    const codeClean = codigo.trim().toUpperCase();
    const qtyClean = parseFloat(cantidad);

    if (!codeClean || !fecha || isNaN(qtyClean) || qtyClean <= 0) {
      setFormMsg({ text: 'Campos obligatorios incompletos o cantidad inválida.', type: 'error' });
      return;
    }

    setSubmitting(true);

    try {
      // Fetch product stock state
      const { data: prodStock, error: stockErr } = await supabase
        .from('v_productos_stock')
        .select('codigo, cantidad')
        .eq('codigo', codeClean)
        .single();

      if (stockErr || !prodStock) {
        setFormMsg({ text: 'El producto no existe. Regístrelo en la pestaña Gestión de Productos.', type: 'error' });
        setSubmitting(false);
        return;
      }

      const stockActual = parseFloat(prodStock.cantidad) || 0;

      // Validate outgoing quantities bounds
      if ((tipo === 'SALIDA' || tipo === 'AJUSTE_NEGATIVO') && stockActual < qtyClean) {
        setFormMsg({ 
          text: `Stock insuficiente. Disponible: ${stockActual}, Solicitado: ${qtyClean}`, 
          type: 'error' 
        });
        setSubmitting(false);
        return;
      }

      // Generate or validate transaction keys
      let finalKey = transactionKey.trim();
      if (finalKey && finalKey !== 'Automatico') {
        const { data: existingMov, error: keyErr } = await supabase
          .from('movimientos')
          .select('id')
          .eq('key', finalKey);
        
        if (keyErr) throw keyErr;

        if (existingMov && existingMov.length > 0) {
          setFormMsg({ text: 'Esta clave de transacción (Transaction Key) ya ha sido registrada.', type: 'error' });
          setSubmitting(false);
          return;
        }
      } else {
        finalKey = await generateUniqueMovementKey();
      }

      const activeUserEmail = user ? user.email : 'Usuario Sistema';

      const { error: insertErr } = await supabase.from('movimientos').insert([{
        producto_codigo: codeClean,
        fecha,
        tipo,
        cantidad: qtyClean,
        usuario: activeUserEmail,
        observaciones: observaciones.trim(),
        key: finalKey
      }]);

      if (insertErr) throw insertErr;

      setFormMsg({ text: 'Movimiento registrado correctamente.', type: 'success' });
      
      // Clear forms
      setCodigo('');
      setNombre('');
      setCantidad('');
      setObservaciones('');
      setTransactionKey('Automatico');
      setCodigoReadOnly(false);
      setNombreReadOnly(false);
    } catch (err) {
      console.error('Error adding transaction:', err);
      setFormMsg({ text: 'Error al registrar: ' + err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Import handler
  const handleImportMovimientosCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setCsvMsg({ text: 'Procesando archivo CSV de movimientos...', type: 'info' });

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
      const colCodigo = headers.findIndex(h => h === 'id producto' || h === 'código' || h === 'codigo' || h === 'cód' || (!h.includes('key') && h.includes('cod')));
      const colCantidad = headers.findIndex(h => h === 'cantidad' || h === 'cant' || h.includes('cant') || h.includes('amount') || h.includes('num'));
      const colKey = headers.findIndex(h => h === 'transaction key' || h === 'product key' || h === 'key' || h === 'clave' || h === 'clav');
      const colFecha = headers.findIndex(h => h === 'fecha de mov.' || h === 'fecha de mov' || h === 'fecha' || h.includes('fech') || h.includes('date'));
      const colObservaciones = headers.findIndex(h => h === 'observaciones' || h === 'obs' || h.includes('obs') || h.includes('comment'));

      if (colCodigo === -1 || colCantidad === -1 || colKey === -1) {
        setCsvMsg({ text: 'Formato CSV incorrecto. El archivo debe contener al menos las columnas: "Transaction Key", "ID Producto", y "Cantidad".', type: 'error' });
        event.target.value = '';
        return;
      }

      try {
        const [resProductos, resMovimientos] = await Promise.all([
          supabase.from('productos').select('codigo'),
          supabase.from('movimientos').select('key')
        ]);

        if (resProductos.error) throw resProductos.error;
        if (resMovimientos.error) throw resMovimientos.error;
        
        const existingCodes = new Set(resProductos.data.map(p => p.codigo.trim().toUpperCase()));
        const existingKeys = new Set(resMovimientos.data.filter(m => m.key).map(m => m.key.trim().toUpperCase()));
        const defaultDate = fecha || new Date().toISOString().slice(0, 10);

        const movementsToInsert = [];
        let skippedInvalidProduct = 0;
        let skippedInvalidAmount = 0;
        let skippedDuplicateKey = 0;
        let emptyCount = 0;
        const seenKeysInCsv = new Set();

        const splitRegex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const cols = line.split(splitRegex).map(c => c.trim().replace(/^"|"$/g, ''));

          if (cols.length <= Math.max(colCodigo, colCantidad, colKey)) {
            emptyCount++;
            continue;
          }

          const codigoVal = cols[colCodigo]?.trim().toUpperCase();
          const cantidadStr = cols[colCantidad]?.trim();
          const keyVal = cols[colKey]?.trim();

          if (!codigoVal || !cantidadStr || !keyVal) {
            emptyCount++;
            continue;
          }

          const upperKey = keyVal.toUpperCase();

          if (!existingCodes.has(codigoVal)) {
            skippedInvalidProduct++;
            continue;
          }

          if (existingKeys.has(upperKey) || seenKeysInCsv.has(upperKey)) {
            skippedDuplicateKey++;
            continue;
          }
          seenKeysInCsv.add(upperKey);

          const qtyVal = parseFloat(cantidadStr);
          if (isNaN(qtyVal) || qtyVal <= 0) {
            skippedInvalidAmount++;
            continue;
          }

          let fechaVal = defaultDate;
          if (colFecha !== -1 && cols[colFecha]) {
            const rawFecha = cols[colFecha].trim();
            const parsedDate = new Date(rawFecha);
            if (!isNaN(parsedDate.getTime())) {
              const year = parsedDate.getFullYear();
              const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
              const day = String(parsedDate.getDate()).padStart(2, '0');
              fechaVal = `${year}-${month}-${day}`;
            }
          }

          let obsVal = '';
          if (colObservaciones !== -1 && cols[colObservaciones]) {
            obsVal = cols[colObservaciones].trim();
          }

          movementsToInsert.push({
            producto_codigo: codigoVal,
            fecha: fechaVal,
            tipo: 'INGRESO',
            cantidad: qtyVal,
            usuario: 'Usuario Sistema',
            observaciones: obsVal,
            key: keyVal
          });
        }

        if (movementsToInsert.length === 0) {
          let msg = 'No se importó ningún movimiento nuevo.';
          if (skippedInvalidProduct > 0 || skippedInvalidAmount > 0 || skippedDuplicateKey > 0) {
            msg += ` (Omitidos: ${skippedInvalidProduct} productos inexistentes, ${skippedDuplicateKey} claves duplicadas, ${skippedInvalidAmount} cantidades inválidas).`;
          }
          setCsvMsg({ text: msg, type: 'warning' });
          event.target.value = '';
          return;
        }

        const { error: insertErr } = await supabase.from('movimientos').insert(movementsToInsert);
        if (insertErr) throw insertErr;

        setCsvMsg({ 
          text: `Importación exitosa: se registraron ${movementsToInsert.length} movimientos de tipo INGRESO. (Omitidos: ${skippedInvalidProduct} productos inexistentes, ${skippedDuplicateKey} claves duplicadas, ${skippedInvalidAmount} cantidades inválidas).`, 
          type: 'success' 
        });

        event.target.value = '';
      } catch (err) {
        console.error('Error importing movements CSV:', err);
        setCsvMsg({ text: 'Error al importar: ' + err.message, type: 'error' });
        event.target.value = '';
      }
    };

    reader.readAsText(file, 'UTF-8');
  };

  // Close dropdowns on clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.autocomplete-container')) {
        setShowCodigoDropdown(false);
        setShowNombreDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  return (
    <div id="movimientos" className="tab-content active">
      <div className="card">
        <div className="card-header">
          <span>Nuevo Movimiento de Inventario</span>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fechaMov">Fecha de mov. *</label>
                <input 
                  type="date" 
                  id="fechaMov" 
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required 
                />
              </div>

              {(tipo === 'INGRESO' || tipo === 'SALIDA') && (
                <div className="form-group">
                  <label htmlFor="keyMov">Transaction Key (Clave)</label>
                  <input 
                    type="text" 
                    id="keyMov" 
                    placeholder="Auto-generada (deje en 'Automatico')" 
                    value={transactionKey}
                    onChange={(e) => setTransactionKey(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group autocomplete-container">
                <label htmlFor="codigoMov">ID Producto *</label>
                <input 
                  type="text" 
                  id="codigoMov" 
                  placeholder="Escriba código para buscar..." 
                  value={codigo}
                  onChange={(e) => handleCodigoChange(e.target.value)}
                  onFocus={handleCodigoFocus}
                  readOnly={codigoReadOnly}
                  required 
                  autoComplete="off"
                />
                {showCodigoDropdown && (
                  <div className="autocomplete-dropdown">
                    {codigoSuggestions.map((p) => (
                      <div 
                        key={p.codigo} 
                        className="autocomplete-item"
                        onMouseDown={() => handleSelectProduct(p)}
                      >
                        <span className="autocomplete-code">{p.codigo}</span>
                        <span className="autocomplete-name">{p.nombre} ({p.grupo})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group autocomplete-container">
                <label htmlFor="nombreMov">Producto</label>
                <input 
                  type="text" 
                  id="nombreMov" 
                  placeholder="Escriba nombre para buscar..." 
                  value={nombre}
                  onChange={(e) => handleNombreChange(e.target.value)}
                  onFocus={handleNombreFocus}
                  readOnly={nombreReadOnly}
                  autoComplete="off"
                />
                {showNombreDropdown && (
                  <div className="autocomplete-dropdown">
                    {nombreSuggestions.map((p) => (
                      <div 
                        key={p.codigo} 
                        className="autocomplete-item"
                        onMouseDown={() => handleSelectProduct(p)}
                      >
                        <span className="autocomplete-code">{p.nombre}</span>
                        <span className="autocomplete-name">{p.codigo} ({p.grupo})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="cantMov">Cantidad *</label>
                <input 
                  type="number" 
                  id="cantMov" 
                  min="0.01" 
                  step="0.01" 
                  placeholder="Cantidad mayor a 0" 
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label htmlFor="tipoMov">Tipo de Movimiento *</label>
                <select 
                  id="tipoMov" 
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value);
                    if (e.target.value !== 'INGRESO' && e.target.value !== 'SALIDA') {
                      setTransactionKey('');
                    } else {
                      setTransactionKey('Automatico');
                    }
                  }}
                  required
                >
                  <option value="INGRESO">Ingreso</option>
                  <option value="SALIDA">Salida</option>
                  <option value="AJUSTE_POSITIVO">Ajuste Positivo</option>
                  <option value="AJUSTE_NEGATIVO">Ajuste Negativo</option>
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="obsMov">Observaciones</label>
                <textarea 
                  id="obsMov" 
                  placeholder="Observaciones opcionales" 
                  rows="3"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>
            </div>
            
            <div className="actions">
              <button type="submit" className="btn btn-success" disabled={submitting}>
                <Save size={16} />
                <span>Guardar Movimiento</span>
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setCodigo('');
                  setNombre('');
                  setCantidad('');
                  setObservaciones('');
                  setTransactionKey('Automatico');
                  setCodigoReadOnly(false);
                  setNombreReadOnly(false);
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
            <span>Importar Ingresos desde CSV</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Seleccione un archivo CSV para registrar múltiples movimientos de tipo <strong>Ingreso</strong> en lote.
            El archivo debe incluir las cabeceras: <strong>Transaction Key</strong>, <strong>ID Producto</strong>, y <strong>Cantidad</strong>.
            <br />
            <strong style={{ color: 'var(--danger)' }}>Nota importante:</strong> Los productos a importar ya deben existir en el sistema.
          </p>
          <div className="actions">
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              <Upload size={16} />
              <span>Seleccionar Archivo CSV</span>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleImportMovimientosCSV} 
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
    </div>
  );
}
