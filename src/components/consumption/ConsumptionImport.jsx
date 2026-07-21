import React, { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';
import { Upload, Search, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, X, Zap, HelpCircle, FileSpreadsheet, Download } from 'lucide-react';
import { fuzzySearch, exactMatchSynonym, normalize } from '../smartimport/fuzzyMatch';

export default function ConsumptionImport({ user, onClose, onImportComplete }) {
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Upload
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileError, setFileError] = useState('');
  const [isFileLoading, setIsFileLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Column Mapping
  const [colDesc, setColDesc] = useState('');
  const [colMetrado, setColMetrado] = useState('');
  const [colMetradoOt, setColMetradoOt] = useState('');
  const [colFecha, setColFecha] = useState('');

  // Step 2: Dictionary Matching
  const [matchedRows, setMatchedRows] = useState([]); // Array of aggregated consumptions { desc, qty, fecha, codigo }
  const [unmatchedRows, setUnmatchedRows] = useState([]); // Array of { desc, totalQty }
  
  // Resolution Step
  const [resolveIndex, setResolveIndex] = useState(0);
  const [productsList, setProductsList] = useState([]);
  const [synonymsList, setSynonymsList] = useState([]);
  const [recipesList, setRecipesList] = useState([]);
  const [resolutions, setResolutions] = useState({}); // { desc: codigo }
  const [savingSynonym, setSavingSynonym] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Import
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  
  const [skippedRows, setSkippedRows] = useState([]);

  const STEPS = [
    { label: 'Cargar Excel', icon: Upload },
    { label: 'Resolver Diccionario', icon: HelpCircle },
    { label: 'Resumen e Importar', icon: Zap }
  ];

  useEffect(() => {
    // Fetch products and synonyms when component mounts
    const fetchDictionary = async () => {
      const [prodRes, synRes, recRes] = await Promise.all([
        supabase.from('productos').select('codigo, nombre'),
        supabase.from('productos_sinonimos').select('texto_sinonimo, producto_codigo'),
        supabase.from('producto_recetas').select('parent_codigo, componente_codigo, multiplicador')
      ]);
      if (prodRes.data) setProductsList(prodRes.data);
      if (synRes.data) setSynonymsList(synRes.data);
      if (recRes.data) setRecipesList(recRes.data);
    };
    fetchDictionary();
  }, []);

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
          setFileError('El archivo está vacío.');
          setIsFileLoading(false);
          return;
        }

        // Find header row (scanning first 10 rows)
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
        
        // Auto-detect columns
        let bestDesc = '', bestMetrado = '', bestMetradoOt = '', bestFecha = '';
        foundHeaders.forEach((h, i) => {
          const lower = h.toLowerCase();
          if (lower.includes('descripcion material')) bestDesc = i;
          if (lower.includes('metrado reportado campo')) bestMetrado = i;
          if (lower.includes('metrado ot')) bestMetradoOt = i;
          if (lower.includes('fecha de metrado')) bestFecha = i;
        });

        setColDesc(bestDesc);
        setColMetrado(bestMetrado);
        setColMetradoOt(bestMetradoOt);
        setColFecha(bestFecha);
        
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

  const parseDateValue = (val) => {
    if (val === undefined || val === null) return '';
    const strVal = String(val).trim();
    if (!strVal) return '';

    if (/^\d+(\.\d+)?$/.test(strVal)) {
      const num = parseFloat(strVal);
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      }
    }

    let match = strVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

    match = strVal.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;

    const parsed = new Date(strVal);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    return '';
  };

  const processAndMatch = () => {
    if (colDesc === '' || colMetrado === '') {
      setFileError('Debes seleccionar las columnas de Descripción y Metrado.');
      return;
    }

    const aggregated = {};

    rawRows.forEach(row => {
      const desc = row[colDesc];
      const qty = parseFloat(row[colMetrado]);
      const qtyOt = colMetradoOt !== '' ? parseFloat(row[colMetradoOt]) : 0;
      const rawFecha = colFecha !== '' ? row[colFecha] : null;
      const fecha = parseDateValue(rawFecha);

      if (!desc || isNaN(qty) || qty <= 0) return;

      const normDesc = String(desc).trim();
      if (!aggregated[normDesc]) {
        aggregated[normDesc] = { desc: normDesc, totalQty: 0, totalQtyOt: 0, fecha: fecha, codigo: null };
      }
      aggregated[normDesc].totalQty += qty;
      if (!isNaN(qtyOt)) aggregated[normDesc].totalQtyOt += qtyOt;
    });

    const mRows = [];
    const uRows = [];
    const autoSkipped = [];

    Object.values(aggregated).forEach(item => {
      // Feature request: Ignore these specific cables by default
      const upDesc = item.desc.toUpperCase();
      if (upDesc === "CABLE DESNUDO 4/0 AWG" || upDesc === "CABLE DESNUDO 2/0 AWG") {
        autoSkipped.push(item);
        return;
      }

      // 1. Try exact synonym
      let foundCode = exactMatchSynonym(item.desc, synonymsList);
      
      // 2. Try exact product name/code fallback
      if (!foundCode) {
        const pMatch = productsList.find(p => p.codigo === item.desc || normalize(p.nombre) === normalize(item.desc));
        if (pMatch) foundCode = pMatch.codigo;
      }

      if (foundCode) {
        item.codigo = foundCode;
        mRows.push(item);
      } else {
        uRows.push(item);
      }
    });

    setMatchedRows(mRows);
    setUnmatchedRows(uRows);
    setSkippedRows(autoSkipped);
    setResolveIndex(0);
    setCurrentStep(uRows.length > 0 ? 1 : 2);
  };

  const handleResolveSynonym = async (codigo) => {
    const currentUnmatched = unmatchedRows[resolveIndex];
    if (!currentUnmatched) return;

    setSavingSynonym(true);
    try {
      // Save to dictionary
      const { error } = await supabase.from('productos_sinonimos').insert({
        producto_codigo: codigo,
        texto_sinonimo: currentUnmatched.desc,
        tipo_columna: 'DESCRIPCION'
      });

      if (error && error.code !== '23505') throw error; // Ignore duplicates

      // Update state
      setResolutions(prev => ({ ...prev, [currentUnmatched.desc]: codigo }));
      
      const newMatchedRow = { ...currentUnmatched, codigo };
      setMatchedRows(prev => [...prev, newMatchedRow]);

      // Move to next
      setResolveIndex(prev => prev + 1);
      setSearchFilter('');
    } catch (err) {
      console.error('Error saving synonym:', err);
      alert('Error al guardar equivalencia: ' + err.message);
    } finally {
      setSavingSynonym(false);
    }
  };

  const executeImport = async () => {
    setIsImporting(true);
    setImportError('');
    try {
      const batchId = 'batch_' + Date.now();
      const rowsToInsert = [];

      for (const row of matchedRows) {
        const recipes = recipesList.filter(r => r.parent_codigo === row.codigo);
        
        if (recipes.length > 0) {
          // BOM Explosion
          for (const comp of recipes) {
            rowsToInsert.push({
              producto_codigo: comp.componente_codigo,
              descripcion_material_original: `[Ensamblado] ${row.desc}`,
              metrado_reportado: row.totalQty * parseFloat(comp.multiplicador),
              metrado_ot: (row.totalQtyOt || 0) * parseFloat(comp.multiplicador),
              fecha_metrado: row.fecha || new Date().toISOString().split('T')[0],
              upload_batch_id: batchId
            });
          }
        } else {
          // Standard Item
          rowsToInsert.push({
            producto_codigo: row.codigo,
            descripcion_material_original: row.desc,
            metrado_reportado: row.totalQty,
            metrado_ot: row.totalQtyOt || 0,
            fecha_metrado: row.fecha || new Date().toISOString().split('T')[0],
            upload_batch_id: batchId
          });
        }
      }

      const { error } = await supabase.from('consumos_campo').insert(rowsToInsert);
      if (error) throw error;

      setImportResult({ count: rowsToInsert.length, batchId });
      setCurrentStep(3); // Success Screen
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error('Import error:', err);
      setImportError('Error al importar: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportSkippedExcel = () => {
    try {
      if (skippedRows.length === 0) {
        alert('No hay elementos omitidos para exportar.');
        return;
      }

      const formattedRows = skippedRows.map(r => {
        return {
          'Descripción Original (Omitida)': r.desc,
          'Metrado Reportado': r.totalQty,
          'Metrado OT': r.totalQtyOt,
          'Fecha': r.fecha || '',
          'Motivo': 'Usuario seleccionó Ignorar en la validación del diccionario'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(formattedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Consumos Omitidos');
      XLSX.writeFile(workbook, 'Consumos_Omitidos.xlsx');
    } catch (err) {
      console.error('Error exporting skipped rows:', err);
      alert('Error al exportar datos omitidos: ' + err.message);
    }
  };

  // UI Renderers
  const renderStep0 = () => (
    <div className="wizard-step animate-fade-in">
      <h3>1. Cargar Reporte de Consumo</h3>
      
      {!fileName ? (
        <div 
          className="upload-dropzone" 
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '40px', border: '2px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', margin: '20px 0' }}
        >
          <Upload size={48} style={{ color: 'var(--primary)', marginBottom: '16px' }} />
          <h4>Haz clic para cargar tu archivo Excel</h4>
          <p className="text-secondary">.xlsx o .csv</p>
          <input type="file" ref={fileInputRef} onChange={(e) => handleFile(e.target.files[0])} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={{ marginTop: '20px' }}>
          <div className="alert success" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <FileSpreadsheet size={18} />
            <span>Archivo cargado: <strong>{fileName}</strong> ({rawRows.length} filas detectadas)</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setFileName('')} style={{ marginLeft: 'auto' }}>Cambiar</button>
          </div>

          <h4>Validar Columnas</h4>
          <p className="text-secondary" style={{ marginBottom: '16px' }}>Por favor confirma qué columnas contienen la información requerida.</p>
          
          <div style={{ display: 'grid', gap: '16px', maxWidth: '500px' }}>
            <div className="form-group">
              <label>Columna de Descripción (Material):</label>
              <select value={colDesc} onChange={e => setColDesc(e.target.value)} className="form-control">
                <option value="">-- Seleccionar --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Columna de Cantidad (Metrado Reportado):</label>
              <select value={colMetrado} onChange={e => setColMetrado(e.target.value)} className="form-control">
                <option value="">-- Seleccionar --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Columna de Metrado OT (Opcional):</label>
              <select value={colMetradoOt} onChange={e => setColMetradoOt(e.target.value)} className="form-control">
                <option value="">-- Ninguna --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Columna de Fecha (Opcional):</label>
              <select value={colFecha} onChange={e => setColFecha(e.target.value)} className="form-control">
                <option value="">-- Ninguna --</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
          </div>

          {fileError && <div className="message error" style={{ marginTop: '16px' }}>{fileError}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button className="btn btn-primary" onClick={processAndMatch}>
              Siguiente: Analizar Diccionario <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep1 = () => {
    const isDone = resolveIndex >= unmatchedRows.length;

    if (isDone) {
      return (
        <div className="wizard-step animate-fade-in" style={{ textAlign: 'center', padding: '40px 0' }}>
          <CheckCircle2 size={64} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
          <h3>¡Todas las descripciones han sido resueltas!</h3>
          <p className="text-secondary" style={{ marginBottom: '24px' }}>
            Se encontraron {matchedRows.length} materiales listos para importar.
          </p>
          <button className="btn btn-primary" onClick={() => setCurrentStep(2)}>
            Siguiente: Confirmar Importación <ArrowRight size={16} />
          </button>
        </div>
      );
    }

    const currentItem = unmatchedRows[resolveIndex];
    let filteredProducts = productsList;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filteredProducts = productsList.filter(p => p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)).slice(0, 50);
    } else {
      // Show fuzzy suggestions
      const fuzzy = fuzzySearch(currentItem.desc, productsList, 0.3, 10);
      filteredProducts = fuzzy.length > 0 ? fuzzy : productsList.slice(0, 10);
    }

    return (
      <div className="wizard-step animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>Resolviendo {resolveIndex + 1} de {unmatchedRows.length}</h3>
          <span className="badge badge-warning">{unmatchedRows.length - resolveIndex} pendientes</span>
        </div>

        <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--warning)' }}>
          <div className="card-body">
            <h5 className="text-warning" style={{ marginBottom: '8px' }}><AlertCircle size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} /> Texto Desconocido</h5>
            <p style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>"{currentItem.desc}"</p>
            <p className="text-secondary" style={{ marginTop: '8px' }}>Cantidad total reportada: <strong>{currentItem.totalQty}</strong></p>
          </div>
        </div>

        <div className="search-filter-group" style={{ marginBottom: '16px' }}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar código o nombre de producto..." 
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No se encontraron coincidencias.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredProducts.map(p => (
                <li 
                  key={p.codigo} 
                  style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <strong>{p.codigo}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.nombre}</div>
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    disabled={savingSynonym}
                    onClick={() => handleResolveSynonym(p.codigo)}
                  >
                    Vincular
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
          <button className="btn btn-secondary" onClick={() => setCurrentStep(0)}><ArrowLeft size={16} /> Volver</button>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              ⚠️ Advertencia: Si ignora este ítem, la fila se descartará y NO se importará.
            </span>
            <button className="btn btn-secondary" onClick={() => {
              setSkippedRows(prev => [...prev, unmatchedRows[resolveIndex]]);
              setResolveIndex(prev => prev + 1);
            }}>
              Ignorar este registro <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="wizard-step animate-fade-in">
      <h3>Resumen de Importación</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-card-hover)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{matchedRows.length}</div>
          <div className="text-secondary">Productos Agrupados</div>
        </div>
        <div className="card" style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-card-hover)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
            {matchedRows.reduce((acc, r) => acc + r.totalQty, 0).toLocaleString()}
          </div>
          <div className="text-secondary">Metrado Total a Importar</div>
        </div>
        
        <div 
          className="card" 
          onClick={handleExportSkippedExcel}
          style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-card-hover)', cursor: skippedRows.length > 0 ? 'pointer' : 'default' }}
          title={skippedRows.length > 0 ? "Descargar datos omitidos en Excel" : "No hay datos omitidos"}
        >
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
            {skippedRows.length}
          </div>
          <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            Registros Omitidos {skippedRows.length > 0 && <Download size={14} />}
          </div>
        </div>
      </div>

      {importError && <div className="message error" style={{ marginBottom: '16px' }}>{importError}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={() => setCurrentStep(1)}><ArrowLeft size={16} /> Atrás</button>
        <button className="btn btn-primary" onClick={executeImport} disabled={isImporting || matchedRows.length === 0}>
          {isImporting ? 'Importando...' : 'Confirmar e Importar Data'} <Zap size={16} />
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="wizard-step animate-fade-in" style={{ textAlign: 'center', padding: '40px 0' }}>
      <CheckCircle2 size={64} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
      <h3>¡Importación Exitosa!</h3>
      <p className="text-secondary" style={{ marginBottom: '24px' }}>
        Se importaron {importResult?.count} registros de consumo.
      </p>
      <button className="btn btn-primary" onClick={onClose}>
        Cerrar Ventana
      </button>
    </div>
  );

  return (
    <div className="dialog-overlay">
      <div className="dialog-card" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        <div className="card-header" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: 'bold' }}>
            <Zap size={20} style={{ color: 'var(--primary)' }} />
            Importar Reporte de Consumo (Metrado)
          </div>
          <button className="btn btn-secondary" style={{ padding: '4px', borderRadius: '50%' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Stepper Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '16px 24px', background: 'var(--bg-card-hover)' }}>
          {STEPS.map((step, idx) => {
            const isActive = currentStep === idx;
            const isCompleted = currentStep > idx;
            const Icon = step.icon;
            return (
              <div key={idx} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: '50%', 
                  background: isActive ? 'var(--primary)' : isCompleted ? 'var(--success)' : 'var(--border-color)', 
                  color: isActive || isCompleted ? 'white' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', zIndex: 2, position: 'relative'
                }}>
                  {isCompleted ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: isActive ? 'bold' : 'normal', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card-body" style={{ overflowY: 'auto', padding: '24px' }}>
          {currentStep === 0 && renderStep0()}
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>

      </div>
    </div>
  );
}
