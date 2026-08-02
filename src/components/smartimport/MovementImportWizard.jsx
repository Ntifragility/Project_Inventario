import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertCircle, ArrowRight, ArrowLeft, X, Zap, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useProjectArea } from '../../contexts/ProjectAreaContext';

export default function MovementImportWizard({ type, onClose, onImportComplete }) {
  const { activeAreaId } = useProjectArea();
  const [currentStep, setCurrentStep] = useState(0);

  // File state
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileError, setFileError] = useState('');
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [resolvedType, setResolvedType] = useState(type || null);
  const fileInputRef = useRef(null);

  // Mappings
  const [colKey, setColKey] = useState('');
  const [colCodigo, setColCodigo] = useState('');
  const [colCantidad, setColCantidad] = useState('');
  const [colFecha, setColFecha] = useState('');
  const [colUM, setColUM] = useState('');
  const [colAlmacenero, setColAlmacenero] = useState(''); // Only used for salidas if needed

  // Preview state
  const [previewData, setPreviewData] = useState([]);
  const [validationStats, setValidationStats] = useState({ total: 0, valid: 0, errors: 0, empty: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const isIngreso = resolvedType === 'ingreso';

  const STEPS = [
    { label: 'Cargar Archivo', icon: Upload },
    { label: 'Validar Datos', icon: FileSpreadsheet },
    { label: 'Importar', icon: Zap }
  ];

  const normalize = (str) => {
    return String(str || '')
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, '');
  };

  const handleFile = (file) => {
    if (!file) return;
    setIsFileLoading(true);
    setFileError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        if (rows.length < 2) {
          setFileError('El archivo está vacío o no contiene suficientes filas.');
          setIsFileLoading(false);
          return;
        }

        // Find header row
        let headerRowIdx = 0;
        let maxHeaders = 0;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const row = rows[i];
          const stringCells = row.filter(c => typeof c === 'string' && c.trim().length > 0);
          if (stringCells.length > maxHeaders) {
            maxHeaders = stringCells.length;
            headerRowIdx = i;
          }
        }

        const foundHeaders = rows[headerRowIdx].map(String);
        setHeaders(foundHeaders);

        // Auto-guess columns
        let guessKey = '', guessCodigo = '', guessCantidad = '', guessFecha = '', guessUM = '', guessAlmacenero = '';
        
        foundHeaders.forEach((h, i) => {
          const norm = normalize(h);
          if (['transactionkey', 'key', 'clave', 'transkey', 'transactionid', 'nro'].includes(norm)) guessKey = i;
          if (['idproducto', 'codigoproducto', 'codigo', 'cod', 'idproduct', 'productcode', 'codigoarticulo'].includes(norm)) guessCodigo = i;
          if (['cantrecepcionada', 'cantidadrecepcionada', 'cant', 'cantidad', 'qty', 'amount', 'cantentregada', 'cantidadentregada', 'cantrec'].includes(norm)) guessCantidad = i;
          if (['fecha', 'fecharecproyecto', 'fecharec', 'date', 'fecharecepcion', 'fechadepedido'].includes(norm)) guessFecha = i;
          if (['um', 'unidad', 'unit', 'umd'].includes(norm)) guessUM = i;
          if (['codalmacenero', 'almacenero', 'keeper', 'solicitante'].includes(norm)) guessAlmacenero = i;
        });

        setColKey(guessKey);
        setColCodigo(guessCodigo);
        setColCantidad(guessCantidad);
        setColFecha(guessFecha);
        setColUM(guessUM);
        setColAlmacenero(guessAlmacenero);

        setRawRows(rows.slice(headerRowIdx + 1));
        setCurrentStep(0);
      } catch (err) {
        setFileError('Error leyendo el archivo: ' + err.message);
      } finally {
        setIsFileLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processPreview = async () => {
    if (!resolvedType) {
      setFileError('Debes seleccionar el tipo de movimiento (Ingreso o Salida).');
      return;
    }

    if (colKey === '' || colCodigo === '' || colCantidad === '') {
      setFileError('Debes seleccionar las columnas obligatorias (Transaction Key, ID Producto, Cantidad).');
      return;
    }

    setIsProcessing(true);
    setFileError('');

    try {
      // 1. Gather all product codes and keys from the file to check against the DB
      const fileCodes = new Set();
      const fileKeys = new Set();
      
      const parsedRows = [];
      let emptyCount = 0;

      rawRows.forEach((row, idx) => {
        const keyRaw = row[colKey];
        const codigoRaw = row[colCodigo];
        const cantidadRaw = row[colCantidad];

        if (keyRaw === undefined || keyRaw === null || codigoRaw === undefined || codigoRaw === null || cantidadRaw === undefined || cantidadRaw === null || String(cantidadRaw).trim() === '') {
          emptyCount++;
          return;
        }

        const keyVal = String(keyRaw).trim();
        const codigoVal = String(codigoRaw).trim().toUpperCase();
        const cantidadVal = parseFloat(cantidadRaw);

        if (!keyVal || !codigoVal || isNaN(cantidadVal)) {
          emptyCount++;
          return;
        }

        fileCodes.add(codigoVal);
        fileKeys.add(keyVal);

        parsedRows.push({
          originalIndex: idx + 2, // Excel row approx
          key: keyVal,
          codigo: codigoVal,
          cantidad: cantidadVal,
          fecha: colFecha !== '' ? String(row[colFecha]).trim() : null,
          um: colUM !== '' ? String(row[colUM]).trim().toUpperCase() : null,
          almacenero: colAlmacenero !== '' ? String(row[colAlmacenero]).trim() : null,
          isValid: true,
          errors: []
        });
      });

      // 2. Validate against DB
      const [resProductos, resMovimientos] = await Promise.all([
        supabase.from('v_productos_stock').select('codigo, unidad').eq('project_area_id', activeAreaId).in('codigo', Array.from(fileCodes)),
        supabase.from('movimientos').select('key').eq('project_area_id', activeAreaId).in('key', Array.from(fileKeys))
      ]);

      if (resProductos.error) throw resProductos.error;
      if (resMovimientos.error) throw resMovimientos.error;

      const validProducts = new Map();
      resProductos.data?.forEach(p => validProducts.set(p.codigo.trim().toUpperCase(), p.unidad?.trim().toUpperCase() || ''));
      const existingKeys = new Set(resMovimientos.data?.map(m => m.key.trim().toUpperCase()));

      let validCount = 0;
      let errorCount = 0;

      parsedRows.forEach(row => {
        if (!validProducts.has(row.codigo)) {
          row.isValid = false;
          row.errors.push('Producto inexistente');
        } else {
          const baseUnit = validProducts.get(row.codigo);
          if (row.um && baseUnit && row.um !== baseUnit) {
            row.errors.push(`Unidad inconsistente (Base: ${baseUnit})`);
          }
        }

        if (isIngreso && existingKeys.has(row.key.toUpperCase())) {
          row.isValid = false;
          row.errors.push('Transacción ya existe');
        }

        if (row.isValid) {
          validCount++;
        } else {
          errorCount++;
        }
      });

      setPreviewData(parsedRows);
      setValidationStats({ total: parsedRows.length, valid: validCount, errors: errorCount, empty: emptyCount });
      setCurrentStep(1);

    } catch (err) {
      console.error(err);
      setFileError('Error procesando datos: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseDate = (val) => {
    if (!val) return new Date().toISOString().slice(0, 10);
    const strVal = String(val).trim();
    if (/^\d+(\.\d+)?$/.test(strVal)) {
      const date = new Date(Math.round((parseFloat(strVal) - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
    // Simple fallback
    const parsed = new Date(strVal);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  };

  const executeImport = async () => {
    setIsImporting(true);
    setImportError('');
    
    try {
      const validRows = previewData.filter(r => r.isValid);
      if (validRows.length === 0) throw new Error("No hay filas válidas para importar.");

      const batchId = `BATCH-${Date.now()}`;
      const movementsToUpsert = validRows.map(row => ({
        key: row.key,
        fecha: parseDate(row.fecha),
        producto_codigo: row.codigo,
        cantidad: row.cantidad,
        tipo: isIngreso ? 'INGRESO' : 'SALIDA',
        upload_batch_id: batchId,
        almacenero: row.almacenero || null,
        unidad: row.um || null,
        project_area_id: activeAreaId
      }));

      const { error } = await supabase.from('movimientos').upsert(movementsToUpsert, { onConflict: 'project_area_id,key' });
      if (error) throw error;

      setImportResult({ count: movementsToUpsert.length, batchId });
      setCurrentStep(2);
      if (onImportComplete) onImportComplete();
      
    } catch (err) {
      console.error(err);
      setImportError('Error al importar: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  // UI Renderers
  const renderStep0 = () => (
    <div className="wizard-step animate-fade-in">
      <h3>1. Cargar Archivo y Mapear Columnas</h3>
      
      {!fileName ? (
        <div 
          className="upload-dropzone" 
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '40px', border: '2px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', margin: '20px 0' }}
        >
          {isFileLoading ? (
            <div className="spinner" style={{ marginBottom: '16px' }}></div>
          ) : (
            <Upload size={48} style={{ color: 'var(--primary)', marginBottom: '16px' }} />
          )}
          <h4>Haz clic para cargar tu archivo Excel</h4>
          <p className="text-secondary">Importar datos de {isIngreso ? 'Ingresos' : 'Salidas'} (.xlsx, .csv)</p>
          <input type="file" ref={fileInputRef} onChange={(e) => handleFile(e.target.files[0])} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={{ marginTop: '20px' }}>
          <div className="alert success" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <FileSpreadsheet size={18} />
            <span>Archivo cargado: <strong>{fileName}</strong> ({rawRows.length} filas detectadas)</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setFileName('')} style={{ marginLeft: 'auto' }}>Cambiar</button>
          </div>

          <h4>Asignar Columnas y Tipo</h4>
          <p className="text-secondary" style={{ marginBottom: '16px' }}>
            Hemos intentado detectar automáticamente las columnas. Por favor verifica y corrige si es necesario.
          </p>

          {!type && (
            <div style={{ background: 'var(--bg-card-header)', padding: '16px', borderRadius: '8px', marginBottom: '24px', borderLeft: '4px solid var(--primary)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontWeight: 'bold' }}>Tipo de Movimiento (Obligatorio):</label>
                <select 
                  value={resolvedType || ''} 
                  onChange={e => setResolvedType(e.target.value)} 
                  className="form-control"
                  style={{ maxWidth: '300px', marginTop: '8px' }}
                >
                  <option value="">-- Seleccionar Tipo --</option>
                  <option value="ingreso">Ingresos (Almacén Central / Procura)</option>
                  <option value="salida">Salidas (Consumos / Despachos)</option>
                </select>
                {!resolvedType && <small className="text-danger" style={{ display: 'block', marginTop: '6px' }}>Debe seleccionar el tipo para continuar.</small>}
              </div>
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="form-group">
              <label>Transaction Key (Req):</label>
              <select value={colKey} onChange={e => setColKey(e.target.value)} className="form-control">
                <option value="">-- Seleccionar --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>ID Producto (Req):</label>
              <select value={colCodigo} onChange={e => setColCodigo(e.target.value)} className="form-control">
                <option value="">-- Seleccionar --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Cantidad (Req):</label>
              <select value={colCantidad} onChange={e => setColCantidad(e.target.value)} className="form-control">
                <option value="">-- Seleccionar --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Fecha (Opcional):</label>
              <select value={colFecha} onChange={e => setColFecha(e.target.value)} className="form-control">
                <option value="">-- Ninguna --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Unidad/UM (Opcional):</label>
              <select value={colUM} onChange={e => setColUM(e.target.value)} className="form-control">
                <option value="">-- Ninguna --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            {!isIngreso && (
              <div className="form-group">
                <label>Almacenero (Opcional):</label>
                <select value={colAlmacenero} onChange={e => setColAlmacenero(e.target.value)} className="form-control">
                  <option value="">-- Ninguna --</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            )}
          </div>

          {fileError && <div className="message error" style={{ marginBottom: '16px' }}>{fileError}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={processPreview} disabled={isProcessing}>
              {isProcessing ? 'Procesando...' : 'Previsualizar y Validar'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div className="wizard-step animate-fade-in">
      <h3>2. Vista Previa y Validación</h3>
      
      <div className="stats-grid" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ padding: '12px' }}>
          <div className="stat-label">Total Filas</div>
          <div className="stat-value">{validationStats.total}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px', borderLeft: '4px solid var(--success)' }}>
          <div className="stat-label">Válidas</div>
          <div className="stat-value text-success">{validationStats.valid}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px', borderLeft: '4px solid var(--danger)' }}>
          <div className="stat-label">Con Errores</div>
          <div className="stat-value text-danger">{validationStats.errors}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px' }}>
          <div className="stat-label">Filas Vacías Ignoradas</div>
          <div className="stat-value">{validationStats.empty}</div>
        </div>
      </div>

      <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Fila Excel</th>
              <th>Transacción</th>
              <th>Producto</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {previewData.slice(0, 100).map((row, i) => (
              <tr key={i} style={{ opacity: row.isValid ? 1 : 0.6 }}>
                <td>{row.originalIndex}</td>
                <td>{row.key}</td>
                <td>{row.codigo}</td>
                <td style={{ textAlign: 'right' }}>{row.cantidad}</td>
                <td>
                  {row.isValid ? (
                    <span className="badge badge-success">Válido</span>
                  ) : (
                    <span className="badge badge-error" title={row.errors.join(', ')}>
                      Error: {row.errors[0]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {previewData.length > 100 && (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Mostrando las primeras 100 filas...
          </div>
        )}
      </div>

      {importError && <div className="message error" style={{ marginBottom: '16px' }}>{importError}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={() => setCurrentStep(0)} disabled={isImporting}>
          <ArrowLeft size={16} /> Volver
        </button>
        <button 
          className="btn btn-success" 
          onClick={executeImport}
          disabled={isImporting || validationStats.valid === 0}
        >
          <Zap size={16} />
          <span>{isImporting ? 'Importando...' : `Importar ${validationStats.valid} Movimientos`}</span>
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="wizard-step animate-fade-in" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <CheckCircle2 size={64} style={{ color: 'var(--success)', margin: '0 auto 20px auto' }} />
      <h2>¡Importación Exitosa!</h2>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Se importaron <strong>{importResult?.count}</strong> movimientos correctamente.
      </p>
      <button className="btn btn-primary" onClick={onClose}>
        Cerrar y Actualizar
      </button>
    </div>
  );

  return (
    <div className="dialog-overlay">
      <div className="dialog-card smart-wizard-modal" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={20} style={{ color: 'var(--accent)' }} />
            <span>Importar {resolvedType === 'ingreso' ? 'Ingresos' : resolvedType === 'salida' ? 'Salidas' : 'Movimientos'} (Desde CSV/Excel)</span>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isImporting}><X size={20} /></button>
        </div>

        <div className="wizard-progress">
          {STEPS.map((step, idx) => (
            <div key={idx} className={`wizard-step-indicator ${currentStep === idx ? 'active' : ''} ${currentStep > idx ? 'completed' : ''}`}>
              <div className="step-icon"><step.icon size={16} /></div>
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>

        <div className="card-body">
          {currentStep === 0 && renderStep0()}
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
        </div>
      </div>
    </div>
  );
}
