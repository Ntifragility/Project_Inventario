import React, { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Filter, Search, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, X, Download, ChevronDown, ChevronUp, Loader2, Zap, HelpCircle, Check, SkipForward } from 'lucide-react';
import { INGRESOS_CONFIG, SALIDAS_CONFIG, detectPipeline, findColumnIndex } from './pipelineConfig';
import { fuzzySearch, exactMatchSynonym, normalize } from './fuzzyMatch';

/**
 * SmartImportWizard — Multi-step wizard for importing raw procurement/warehouse files.
 * Replaces the external Power Query preprocessing pipeline.
 */
export default function SmartImportWizard({ user, onClose, onImportComplete }) {
  // ── Wizard State ──
  const [currentStep, setCurrentStep] = useState(0);
  const [pipelineType, setPipelineType] = useState(null); // 'ingresos' | 'salidas'
  const [config, setConfig] = useState(null);

  // Dynamic Filters State
  const [dbAlmaceneros, setDbAlmaceneros] = useState([]);
  const [dbDisciplinas, setDbDisciplinas] = useState([]);
  const [selectedDisciplina, setSelectedDisciplina] = useState('');
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Step 1: File Upload
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [rawHeaders, setRawHeaders] = useState([]);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [isFileLoading, setIsFileLoading] = useState(false);

  // Step 2: Filter & Transform
  const [filteredRows, setFilteredRows] = useState([]);
  const [filterStats, setFilterStats] = useState({ total: 0, kept: 0, removed: 0 });

  // Step 3: Dictionary Matching
  const [matchedRows, setMatchedRows] = useState([]);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [discardedRows, setDiscardedRows] = useState([]);
  const [matchingProgress, setMatchingProgress] = useState(0);
  const [isMatching, setIsMatching] = useState(false);

  // Step 4: Resolve
  const [resolveIndex, setResolveIndex] = useState(0);
  const [productsList, setProductsList] = useState([]);
  const [resolutions, setResolutions] = useState({}); // { description: producto_codigo }
  const [confirmDialog, setConfirmDialog] = useState(null); // { title: '', message: '', onConfirm: () => {}, onCancel: () => {} }
  const [skippedDescriptions, setSkippedDescriptions] = useState(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [savingSynonym, setSavingSynonym] = useState(false);

  // Step 5: Preview
  const [previewData, setPreviewData] = useState([]);
  const [previewPage, setPreviewPage] = useState(1);
  const previewRowsPerPage = 25;

  // Step 6: Import
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const STEPS = [
    { label: 'Cargar Archivo', icon: Upload },
    { label: 'Filtrar', icon: Filter },
    { label: 'Diccionario', icon: Search },
    { label: 'Resolver', icon: HelpCircle },
    { label: 'Vista Previa', icon: FileSpreadsheet },
    { label: 'Importar', icon: Zap }
  ];

  // ══════════════════════════════════════════════════════════════
  // INITIALIZATION: FETCH DYNAMIC FILTERS
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    const fetchFilters = async () => {
      setLoadingFilters(true);
      try {
        const [resAlm, resDisc] = await Promise.all([
          supabase.from('almaceneros').select('codigo'),
          supabase.from('disciplinas').select('nombre')
        ]);
        if (resAlm.error) throw resAlm.error;
        if (resDisc.error) throw resDisc.error;
        
        setDbAlmaceneros((resAlm.data || []).map(a => String(a.codigo).toLowerCase()));
        
        const discList = (resDisc.data || []).map(d => String(d.nombre));
        setDbDisciplinas(discList);
        // Auto-select if there's exactly one option
        if (discList.length === 1) setSelectedDisciplina(discList[0]);
      } catch (err) {
        console.error('Error fetching dynamic filters:', err);
      } finally {
        setLoadingFilters(false);
      }
    };
    fetchFilters();
  }, []);

  // ══════════════════════════════════════════════════════════════
  // STEP 1: FILE UPLOAD
  // ══════════════════════════════════════════════════════════════

  const handleFile = useCallback((file) => {
    if (!file) return;
    setIsFileLoading(true);
    setFileError('');
    setFileName(file.name);
    setMatchedRows([]);
    setUnmatchedRows([]);
    setDiscardedRows([]);
    setResolutions({});

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        if (rows.length < 2) {
          setFileError('El archivo está vacío o no contiene datos suficientes.');
          setIsFileLoading(false);
          return;
        }

        // Auto-detect which row contains the column headers by scanning the first 5 rows
        let headerRowIndex = 0;
        let maxMatchCount = 0;
        const allConfigs = [INGRESOS_CONFIG, SALIDAS_CONFIG];
        const scanLimit = Math.min(rows.length, 5);

        for (let r = 0; r < scanLimit; r++) {
          const candidateHeaders = rows[r].map(h =>
            String(h || '')
              .trim()
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9.]/g, '')
          );

          for (const config of allConfigs) {
            let configMatches = 0;
            for (const sig of config.signatureColumns) {
              const normSig = sig
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9.]/g, '');
              if (candidateHeaders.some(h => h === normSig || h.includes(normSig))) {
                configMatches++;
              }
            }
            if (configMatches > maxMatchCount) {
              maxMatchCount = configMatches;
              headerRowIndex = r;
            }
          }
        }

        const headers = rows[headerRowIndex].map(h => String(h || '').trim());
        const detected = detectPipeline(headers);

        if (detected === 'unknown') {
          setFileError(
            'No se pudo detectar el tipo de archivo. Asegúrese de que sea una Tabla_Procura (Ingresos) o Tabla_Almacen (Salidas) válida.'
          );
          setIsFileLoading(false);
          return;
        }

        setRawHeaders(headers);
        setRawRows(rows.slice(headerRowIndex + 1));
        setPipelineType(detected);
        setConfig(detected === 'ingresos' ? INGRESOS_CONFIG : SALIDAS_CONFIG);
        setCurrentStep(1); // Auto-advance to filter step
      } catch (err) {
        console.error('Error reading file:', err);
        setFileError('Error al leer el archivo: ' + err.message);
      } finally {
        setIsFileLoading(false);
      }
    };
    reader.onerror = () => {
      setFileError('Error al leer el archivo.');
      setIsFileLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // STEP 2: FILTER & TRANSFORM
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (currentStep !== 1 || !config || rawRows.length === 0) return;

    const filterColIdx = findColumnIndex(rawHeaders, config.filterColumn);
    if (filterColIdx === -1) {
      setFileError(`No se encontró la columna "${config.filterColumn}" en el archivo.`);
      setCurrentStep(0);
      return;
    }

    // Build column index map for source columns
    const colMap = {};
    for (const col of config.sourceColumns) {
      const idx = findColumnIndex(rawHeaders, col);
      if (idx !== -1) colMap[col] = idx;
    }

    let kept = [];
    let removedCount = 0;

    for (const row of rawRows) {
      const filterVal = String(row[filterColIdx] || '').trim();

      let passes = false;
      if (pipelineType === 'ingresos') {
        if (!selectedDisciplina) continue; // Skip all if no disciplina is selected yet
        passes = filterVal.toLowerCase() === selectedDisciplina.toLowerCase();
      } else {
        // Salidas: check if almacenero code is in the dynamic database list
        passes = dbAlmaceneros.some(v => v === filterVal.toLowerCase());
      }

      if (!passes) {
        removedCount++;
        continue;
      }

      // Extract only the columns we need
      const extracted = {};
      for (const [colName, colIdx] of Object.entries(colMap)) {
        extracted[colName] = row[colIdx] !== undefined ? row[colIdx] : '';
      }

      // Skip completely empty rows
      const hasData = Object.values(extracted).some(v => String(v).trim() !== '');
      if (!hasData) {
        removedCount++;
        continue;
      }

      kept.push(extracted);
    }

    setFilteredRows(kept);
    setFilterStats({ total: rawRows.length, kept: kept.length, removed: removedCount });
  }, [currentStep, config, rawRows, rawHeaders, pipelineType, selectedDisciplina, dbAlmaceneros]);

  // ══════════════════════════════════════════════════════════════
  // STEP 3: DICTIONARY MATCHING
  // ══════════════════════════════════════════════════════════════

  const runMatching = useCallback(async () => {
    if (!config || filteredRows.length === 0) return;
    setIsMatching(true);
    setMatchingProgress(0);

    try {
      // Fetch all synonyms from database
      const { data: synonyms, error: synError } = await supabase
        .from('productos_sinonimos')
        .select('texto_sinonimo, producto_codigo, tipo_columna');

      if (synError) throw synError;

      // Fetch products list for fuzzy matching later
      const { data: products, error: prodError } = await supabase
        .from('v_productos_stock')
        .select('codigo, nombre, unidad');

      if (prodError) throw prodError;
      setProductsList(products || []);

      const descCol = config.descriptionColumn;
      const matched = [];
      const unmatched = [];
      const discarded = [];
      const totalRows = filteredRows.length;

      for (let i = 0; i < totalRows; i++) {
        const row = filteredRows[i];
        const description = String(row[descCol] || '').trim();

        if (!description) {
          continue;
        }

        const normalizedDesc = normalize(description);

        // 1. Try exact match against product code
        let matchedCodigo = null;
        const directByCode = products.find(p => normalize(p.codigo) === normalizedDesc);
        if (directByCode) {
          matchedCodigo = directByCode.codigo;
        }

        // 2. Try exact match against product name (official DESCRIPCION)
        if (!matchedCodigo) {
          const directByName = products.find(p => {
            const normP = normalize(p.nombre);
            if (normalizedDesc.includes('cemento') || normalizedDesc.includes('cinta')) {
              console.log(`Exact Match Check: p.nombre="${p.nombre}" (norm="${normP}") vs desc="${description}" (norm="${normalizedDesc}")`);
            }
            return normP === normalizedDesc;
          });
          if (directByName) {
            matchedCodigo = directByName.codigo;
            console.log(`Matched EXACTLY: desc="${description}" -> codigo="${matchedCodigo}"`);
          }
        }

        // 3. Try exact match against database synonyms (covers EQUIV, TXT_LARGO, TXT_POS)
        if (!matchedCodigo) {
          matchedCodigo = exactMatchSynonym(description, synonyms || []);
        }

        if (matchedCodigo) {
          matched.push({ ...row, _matchedCodigo: matchedCodigo, _matchType: 'exact' });
        } else {
          // Lefover: Check fuzzy similarity against all products. Keep only if similarity is >= 0.45.
          // Discard immediately if similarity is < 0.45 (Inner Join behavior in Power Query).
          const suggestions = fuzzySearch(description, products, 0.45, 1);
          if (suggestions.length > 0) {
            unmatched.push({ ...row, _description: description });
          } else {
            discarded.push({ ...row, _description: description });
          }
        }

        // Update progress every 50 rows
        if (i % 50 === 0) {
          setMatchingProgress(Math.round((i / totalRows) * 100));
          await new Promise(r => setTimeout(r, 0)); // Yield to UI
        }
      }

      setMatchedRows(matched);
      setUnmatchedRows(unmatched);
      setDiscardedRows(discarded);
      setMatchingProgress(100);
    } catch (err) {
      console.error('Error during matching:', err);
      setFileError('Error durante el matching: ' + err.message);
    } finally {
      setIsMatching(false);
    }
  }, [config, filteredRows]);

  useEffect(() => {
    if (currentStep === 2) {
      runMatching();
    }
  }, [currentStep]);

  // ══════════════════════════════════════════════════════════════
  // STEP 4: RESOLVE UNKNOWN ITEMS
  // ══════════════════════════════════════════════════════════════

  // Get unique unmatched descriptions (many rows might share the same description)
  const uniqueUnmatched = React.useMemo(() => {
    const seen = new Set();
    const unique = [];
    for (const row of unmatchedRows) {
      const desc = row._description;
      if (!seen.has(desc) && !resolutions[desc] && !skippedDescriptions.has(desc)) {
        seen.add(desc);
        unique.push(desc);
      }
    }
    return unique;
  }, [unmatchedRows, resolutions, skippedDescriptions]);

  const currentUnmatched = uniqueUnmatched[resolveIndex] || null;

  const fuzzyResults = React.useMemo(() => {
    if (!currentUnmatched) return [];
    return fuzzySearch(currentUnmatched, productsList, 0.35, 8);
  }, [currentUnmatched, productsList]);

  const handleResolve = async (description, productCodigo) => {
    setSavingSynonym(true);
    try {
      // Save synonym to database so it learns for next time
      const { error } = await supabase
        .from('productos_sinonimos')
        .upsert({
          producto_codigo: productCodigo,
          texto_sinonimo: description,
          tipo_columna: 'DESCRIPCION'
        }, { onConflict: 'texto_sinonimo,tipo_columna' });

      if (error) throw error;

      setResolutions(prev => ({ ...prev, [description]: productCodigo }));
      // Auto-advance to next unmatched item
      if (resolveIndex < uniqueUnmatched.length - 1) {
        setResolveIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error saving synonym:', err);
      alert('Error al guardar sinónimo: ' + err.message);
    } finally {
      setSavingSynonym(false);
    }
  };

  const handleSkip = (description) => {
    setSkippedDescriptions(prev => new Set([...prev, description]));
    if (resolveIndex < uniqueUnmatched.length - 1) {
      setResolveIndex(prev => prev + 1);
    }
  };

  const handleSkipAll = () => {
    const allDescs = new Set(uniqueUnmatched);
    setSkippedDescriptions(prev => new Set([...prev, ...allDescs]));
  };

  const handleExportUnmatchedExcel = () => {
    try {
      if (unmatchedRows.length === 0) {
        alert('No hay pendientes para exportar.');
        return;
      }

      const formattedRows = unmatchedRows.map((row) => {
        const cleanRow = {};
        for (const k of Object.keys(row)) {
          if (!k.startsWith('_')) {
            cleanRow[k] = row[k];
          }
        }

        const desc = row._description || '';
        const suggestions = fuzzySearch(desc, productsList, 0.20, 3);

        if (suggestions[0]) {
          cleanRow['Sugerencia_1_Codigo'] = suggestions[0].codigo;
          cleanRow['Sugerencia_1_Nombre'] = suggestions[0].nombre;
          cleanRow['Sugerencia_1_Similitud'] = `${Math.round(suggestions[0].score * 100)}%`;
        } else {
          cleanRow['Sugerencia_1_Codigo'] = '';
          cleanRow['Sugerencia_1_Nombre'] = '';
          cleanRow['Sugerencia_1_Similitud'] = '';
        }

        if (suggestions[1]) {
          cleanRow['Sugerencia_2_Codigo'] = suggestions[1].codigo;
          cleanRow['Sugerencia_2_Nombre'] = suggestions[1].nombre;
          cleanRow['Sugerencia_2_Similitud'] = `${Math.round(suggestions[1].score * 100)}%`;
        } else {
          cleanRow['Sugerencia_2_Codigo'] = '';
          cleanRow['Sugerencia_2_Nombre'] = '';
          cleanRow['Sugerencia_2_Similitud'] = '';
        }

        if (suggestions[2]) {
          cleanRow['Sugerencia_3_Codigo'] = suggestions[2].codigo;
          cleanRow['Sugerencia_3_Nombre'] = suggestions[2].nombre;
          cleanRow['Sugerencia_3_Similitud'] = `${Math.round(suggestions[2].score * 100)}%`;
        } else {
          cleanRow['Sugerencia_3_Codigo'] = '';
          cleanRow['Sugerencia_3_Nombre'] = '';
          cleanRow['Sugerencia_3_Similitud'] = '';
        }

        return cleanRow;
      });

      const worksheet = XLSX.utils.json_to_sheet(formattedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pendientes');
      XLSX.writeFile(workbook, 'Pendientes_Importacion_Fuzzy.xlsx');

      setConfirmDialog({
        title: 'Archivo de pendientes descargado',
        message: 'Se ha descargado el archivo "Pendientes_Importacion_Fuzzy.xlsx".\n\n¿Desea avanzar directamente a la vista previa para importar solo las coincidencias exactas?',
        onConfirm: () => {
          handleSkipAll();
          setCurrentStep(4);
        }
      });
    } catch (err) {
      console.error('Error exporting unmatched rows:', err);
      alert('Error al exportar a Excel: ' + err.message);
    }
  };

  const handleExportDiscardedExcel = () => {
    try {
      if (discardedRows.length === 0) {
        alert('No hay registros sin coincidencia para exportar.');
        return;
      }

      const formattedRows = discardedRows.map((row) => {
        const cleanRow = {};
        for (const k of Object.keys(row)) {
          if (!k.startsWith('_')) {
            cleanRow[k] = row[k];
          }
        }
        return cleanRow;
      });

      const worksheet = XLSX.utils.json_to_sheet(formattedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sin Coincidencia');
      XLSX.writeFile(workbook, 'Sin_Coincidencias_Importacion.xlsx');
    } catch (err) {
      console.error('Error exporting discarded rows:', err);
      alert('Error al exportar sin coincidencia: ' + err.message);
    }
  };

  const handleExportIncompleteExcel = () => {
    try {
      const incomplete = previewData.filter(r => !r._valid);
      if (incomplete.length === 0) {
        alert('No hay registros con datos incompletos para exportar.');
        return;
      }

      const formattedRows = incomplete.map((r) => {
        const cleanRow = {
          'Transaction Key': r.transactionKey,
          'Fecha': r.fecha,
          'ID Producto': r.productCodigo || 'NO ESPECIFICADO',
          'Producto': r.productName,
          'Cantidad': r.cantidad,
          'Unidad': r.unidad,
          'Tipo Movimiento': r.tipo,
          'Almacenero': r.almacenero || '',
          'Detalle de error': !r.transactionKey ? 'Falta clave de transacción' :
                              !r.productCodigo ? 'Producto no identificado' :
                              r.cantidad <= 0 ? 'Cantidad debe ser mayor a 0' :
                              !r._fechaRaw ? 'Fecha no especificada o inválida' : 'Datos incompletos'
        };
        for (const [k, v] of Object.entries(r.extras || {})) {
          cleanRow[k] = v;
        }
        return cleanRow;
      });

      const worksheet = XLSX.utils.json_to_sheet(formattedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos Incompletos');
      XLSX.writeFile(workbook, 'Datos_Incompletos_Importacion.xlsx');
    } catch (err) {
      console.error('Error exporting incomplete rows:', err);
      alert('Error al exportar datos incompletos: ' + err.message);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // STEP 5: BUILD PREVIEW DATA
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (currentStep !== 4) return;

    const preview = [];
    const descCol = config.descriptionColumn;

    // Process matched rows
    for (const row of matchedRows) {
      preview.push(buildPreviewRow(row, row._matchedCodigo, 'auto'));
    }

    // Process resolved rows
    for (const row of unmatchedRows) {
      const desc = row._description;
      if (resolutions[desc]) {
        preview.push(buildPreviewRow(row, resolutions[desc], 'resolved'));
      }
      // Skipped rows are excluded from import
    }

    // Sort by fecha descending (Golden Rule)
    preview.sort((a, b) => {
      const dA = new Date(a._fechaRaw || '1900-01-01').getTime();
      const dB = new Date(b._fechaRaw || '1900-01-01').getTime();
      return dB - dA;
    });

    setPreviewData(preview);
    setPreviewPage(1);
  }, [currentStep, matchedRows, unmatchedRows, resolutions]);

  const buildPreviewRow = (row, productCodigo, matchType) => {
    const mapping = config.columnMapping;
    const product = productsList.find(p => p.codigo === productCodigo);

    // Parse date
    let fechaRaw = '';
    const fechaSourceCol = pipelineType === 'ingresos' ? 'F.Rec.Proy' : 'Fecha de pedido';
    const rawDate = row[fechaSourceCol];
    if (rawDate) {
      fechaRaw = parseDateValue(rawDate);
    }

    // Fallback 1: use Fec.Creac. if primary date is empty/invalid (for Ingresos)
    if (!fechaRaw && pipelineType === 'ingresos') {
      const fallbackVal = row['Fec.Creac.'];
      if (fallbackVal) {
        fechaRaw = parseDateValue(fallbackVal);
      }
    }

    // Fallback 2: if still empty/invalid, use today's date so the row is not rejected
    if (!fechaRaw) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      fechaRaw = `${yyyy}-${mm}-${dd}`;
    }

    // Parse quantity
    const qtyCol = pipelineType === 'ingresos' ? 'CantRecep.' : 'Cant. entregada';
    const cantidad = parseFloat(row[qtyCol]) || 0;

    // Transaction key
    const keyCol = pipelineType === 'ingresos' ? 'TRANSACTION KEY' : 'Nro';
    const transactionKey = String(row[keyCol] || '').trim();

    // Unit
    const unitCol = pipelineType === 'ingresos' ? 'UMP' : 'UM';
    const unidad = String(row[unitCol] || '').trim();

    // Description (original)
    const descCol = config.descriptionColumn;
    const descripcion = String(row[descCol] || '').trim();

    // Almacenero (Salidas only)
    const almacenero = pipelineType === 'salidas' ? String(row['Cód.Almacenero'] || '').trim() : '';

    // Extra columns for display
    const extras = {};
    for (const col of config.extraColumns) {
      extras[col] = row[col] !== undefined ? row[col] : '';
    }

    return {
      transactionKey,
      _fechaRaw: fechaRaw,
      fecha: fechaRaw ? fechaRaw.split('-').reverse().join('/') : '',
      productCodigo,
      productName: product ? product.nombre : descripcion,
      cantidad,
      unidad: product ? product.unidad : unidad,
      tipo: config.movementType,
      almacenero,
      matchType,
      descripcionOriginal: descripcion,
      extras,
      _valid: Boolean(transactionKey && productCodigo && cantidad > 0 && fechaRaw)
    };
  };

  // Date parser (reusing the logic from Movements.jsx)
  const parseDateValue = (val) => {
    if (val === undefined || val === null) return '';
    const strVal = String(val).trim();
    if (!strVal) return '';

    // Excel serial number
    if (/^\d+(\.\d+)?$/.test(strVal)) {
      const num = parseFloat(strVal);
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      }
    }

    // YYYY-MM-DD or YYYY/MM/DD
    let match = strVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    match = strVal.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }

    // JS Date fallback
    const parsed = new Date(strVal);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    return '';
  };

  // ══════════════════════════════════════════════════════════════
  // STEP 6: EXECUTE IMPORT
  // ══════════════════════════════════════════════════════════════

  const handleImport = async () => {
    setIsImporting(true);
    setImportError('');

    try {
      const validRows = previewData.filter(r => r._valid);
      if (validRows.length === 0) {
        setImportError('No hay filas válidas para importar.');
        setIsImporting(false);
        return;
      }

      const activeUserEmail = user ? (user.user_metadata?.name || user.user_metadata?.full_name || user.email) : 'Usuario Sistema';

      // Build movements array
      const movements = validRows.map(row => {
        let observaciones = '';
        if (row.unidad) observaciones = `UM: ${row.unidad}`;
        if (row.almacenero) {
          observaciones = observaciones ? `${observaciones}, Almacenero: ${row.almacenero}` : `Almacenero: ${row.almacenero}`;
        }

        return {
          producto_codigo: row.productCodigo,
          fecha: row._fechaRaw,
          tipo: row.tipo,
          cantidad: row.cantidad,
          usuario: activeUserEmail,
          observaciones,
          key: row.transactionKey
        };
      });

      // Check for existing keys
      const keys = movements.map(m => m.key);
      const { data: existingKeys, error: keyError } = await supabase
        .from('movimientos')
        .select('key')
        .in('key', keys);

      if (keyError) throw keyError;

      const existingKeySet = new Set((existingKeys || []).map(k => k.key?.toUpperCase()));

      if (config.movementType === 'INGRESO') {
        // Ingresos: upsert (allows updates)
        const { error } = await supabase
          .from('movimientos')
          .upsert(movements, { onConflict: 'key' });
        if (error) throw error;

        const insertCount = movements.filter(m => !existingKeySet.has(m.key?.toUpperCase())).length;
        const updateCount = movements.length - insertCount;

        setImportResult({
          total: movements.length,
          inserted: insertCount,
          updated: updateCount,
          skipped: previewData.length - validRows.length
        });
      } else {
        // Salidas: insert only (no upsert), skip existing keys
        const newMovements = movements.filter(m => !existingKeySet.has(m.key?.toUpperCase()));
        const skippedDupes = movements.length - newMovements.length;

        if (newMovements.length > 0) {
          // Validate stock before inserting
          const codigos = [...new Set(newMovements.map(m => m.producto_codigo))];
          const { data: stockData, error: stockError } = await supabase
            .from('v_productos_stock')
            .select('codigo, cantidad')
            .in('codigo', codigos);

          if (stockError) throw stockError;

          const stockMap = new Map((stockData || []).map(s => [s.codigo, parseFloat(s.cantidad) || 0]));

          // Track local stock changes during import
          const localStock = new Map(stockMap);
          const validMovements = [];
          let insufficientStock = 0;

          for (const mov of newMovements) {
            const available = localStock.get(mov.producto_codigo) || 0;
            if (available < mov.cantidad) {
              insufficientStock++;
              continue;
            }
            localStock.set(mov.producto_codigo, available - mov.cantidad);
            validMovements.push(mov);
          }

          if (validMovements.length > 0) {
            const { error } = await supabase
              .from('movimientos')
              .insert(validMovements);
            if (error) throw error;
          }

          setImportResult({
            total: movements.length,
            inserted: validMovements.length,
            updated: 0,
            skipped: previewData.length - validRows.length + skippedDupes + insufficientStock,
            skippedDupes,
            insufficientStock
          });
        } else {
          setImportResult({
            total: movements.length,
            inserted: 0,
            updated: 0,
            skipped: previewData.length - validRows.length + skippedDupes,
            skippedDupes
          });
        }
      }
    } catch (err) {
      console.error('Import error:', err);
      setImportError('Error durante la importación: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════════════════════════════════

  const canAdvance = () => {
    switch (currentStep) {
      case 0: return rawRows.length > 0 && config !== null;
      case 1: return filteredRows.length > 0 && (pipelineType === 'salidas' || (pipelineType === 'ingresos' && selectedDisciplina));
      case 2: return !isMatching;
      case 3: return true; // Can always advance from resolve (skip all)
      case 4: return previewData.some(r => r._valid);
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 3) {
      // Moving from Resolve to Preview
      setCurrentStep(4);
    } else if (currentStep === 4) {
      // Moving from Preview to Import — execute
      setCurrentStep(5);
      handleImport();
    } else if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // EXPORT PREVIEW AS EXCEL
  // ══════════════════════════════════════════════════════════════

  const handleExportPreview = () => {
    const exportData = previewData.map(r => ({
      'Transaction Key': r.transactionKey,
      'Fecha': r.fecha,
      'ID Producto': r.productCodigo,
      'Producto': r.productName,
      'Cantidad': r.cantidad,
      'Unidad': r.unidad,
      'Tipo': r.tipo,
      ...(pipelineType === 'salidas' ? { 'Almacenero': r.almacenero } : {}),
      'Match': r.matchType,
      'Descripción Original': r.descripcionOriginal,
      ...r.extras
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vista Previa');
    XLSX.writeFile(wb, `smart_import_preview_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="smart-wizard-overlay">
      <div className="smart-wizard-container">
        {/* Header */}
        <div className="smart-wizard-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>
              <Zap size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Smart Import Wizard
            </h2>
            {pipelineType && (
              <span className="smart-wizard-badge" data-type={pipelineType}>
                {pipelineType === 'ingresos' ? '📥 Ingresos (Tabla Procura)' : '📤 Salidas (Tabla Almacén)'}
              </span>
            )}
          </div>
          <button className="smart-wizard-close" onClick={onClose} title="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Stepper */}
        <div className="smart-wizard-stepper">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            return (
              <div
                key={idx}
                className={`smart-wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              >
                <div className="smart-wizard-step-icon">
                  {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <span className="smart-wizard-step-label">{step.label}</span>
                {idx < STEPS.length - 1 && <div className="smart-wizard-step-connector" />}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="smart-wizard-body">
          {/* ── STEP 0: FILE UPLOAD ── */}
          {currentStep === 0 && (
            <div className="smart-wizard-step-content">
              <h3>Paso 1: Cargar archivo fuente</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                Suba directamente el archivo Excel sin procesar. El sistema detectará automáticamente
                si es una <strong>Tabla de Procura</strong> (Ingresos) o una <strong>Tabla de Almacén</strong> (Salidas).
              </p>

              <div
                className={`smart-wizard-dropzone ${isDragging ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                 {isFileLoading ? (
                  <>
                    <Loader2 size={40} className="spin-animation" style={{ color: 'var(--accent)' }} />
                    <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Cargando y analizando archivo...</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Por favor, espere un momento
                    </p>
                  </>
                ) : fileName ? (
                  <>
                    <FileSpreadsheet size={40} style={{ color: 'var(--accent)' }} />
                    <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{fileName}</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {rawRows.length} filas · {rawHeaders.length} columnas
                    </p>
                  </>
                ) : (
                  <>
                    <Upload size={40} style={{ color: 'var(--text-secondary)' }} />
                    <p style={{ margin: '8px 0 0', fontWeight: 600 }}>
                      Arrastre un archivo aquí o haga clic para seleccionar
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Formatos: .xlsx, .xls, .csv
                    </p>
                  </>
                )}
              </div>

              {fileError && (
                <div className="message error" style={{ marginTop: 12 }}>
                  <AlertCircle size={16} />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: FILTER & TRANSFORM ── */}
          {currentStep === 1 && (
            <div className="smart-wizard-step-content">
              <h3>Paso 2: Filtrar y transformar</h3>

              <div className="smart-wizard-stats-grid">
                <div className="smart-wizard-stat">
                  <span className="stat-number">{filterStats.total}</span>
                  <span className="stat-label">Filas totales</span>
                </div>
                <div className="smart-wizard-stat success">
                  <span className="stat-number">{filterStats.kept}</span>
                  <span className="stat-label">Filas seleccionadas</span>
                </div>
                <div className="smart-wizard-stat warning">
                  <span className="stat-number">{filterStats.removed}</span>
                  <span className="stat-label">Filas descartadas</span>
                </div>
              </div>

              <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-card-header)', borderRadius: 8, fontSize: '0.9rem' }}>
                <p style={{ margin: 0 }}>
                  <strong>Filtro aplicado:</strong>{' '}
                  {pipelineType === 'ingresos' ? (
                    <div style={{ marginTop: 12, padding: '12px', background: 'var(--bg-app)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Seleccione la Disciplina a Importar:
                      </label>
                      <select 
                        value={selectedDisciplina} 
                        onChange={(e) => setSelectedDisciplina(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--primary)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '1rem', cursor: 'pointer' }}
                      >
                        <option value="">-- Seleccionar Disciplina --</option>
                        {dbDisciplinas.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <><code>{config.filterColumn}</code> ∈ [ {dbAlmaceneros.length > 0 ? dbAlmaceneros.join(', ') : 'Cargando almaceneros...'} ]</>
                  )}
                </p>
                <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                  Columnas extraídas: {config.sourceColumns.length} de {rawHeaders.length}
                </p>
              </div>

              {filteredRows.length === 0 && (
                <div className="message warning" style={{ marginTop: 12 }}>
                  <AlertCircle size={16} />
                  <span>Ninguna fila pasó el filtro. Verifique que el archivo es correcto.</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: DICTIONARY MATCHING ── */}
          {currentStep === 2 && (
            <div className="smart-wizard-step-content">
              <h3>Paso 3: Matching con diccionario</h3>

              {isMatching ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Loader2 size={40} className="spin-animation" style={{ color: 'var(--accent)' }} />
                  <p style={{ marginTop: 12 }}>Buscando coincidencias en el diccionario...</p>
                  <div className="smart-wizard-progress-bar">
                    <div className="smart-wizard-progress-fill" style={{ width: `${matchingProgress}%` }} />
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{matchingProgress}%</p>
                </div>
              ) : (
                <>
                  <div className="smart-wizard-stats-grid">
                    <div className="smart-wizard-stat success">
                      <span className="stat-number">{matchedRows.length}</span>
                      <span className="stat-label">Coincidencias exactas</span>
                    </div>
                    <div 
                      className="smart-wizard-stat warning clickable-stat-card"
                      onClick={handleExportUnmatchedExcel}
                      title="Descargar coincidencia parcial en Excel"
                    >
                      <span className="stat-number">{unmatchedRows.length}</span>
                      <span className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        Coincidencias parciales <Download size={14} />
                      </span>
                    </div>
                    <div 
                      className="smart-wizard-stat danger clickable-stat-card"
                      onClick={handleExportDiscardedExcel}
                      title="Descargar sin coincidencia en Excel"
                    >
                      <span className="stat-number">{discardedRows.length}</span>
                      <span className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        Sin coincidencia <Download size={14} />
                      </span>
                    </div>
                  </div>

                  {unmatchedRows.length > 0 && (
                    <div className="message warning" style={{ marginTop: 12 }}>
                      <AlertCircle size={16} />
                      <span>
                        Se encontraron <strong>{unmatchedRows.length}</strong> filas con coincidencia parcial en el diccionario (similitud &ge; 45%).
                        En el siguiente paso podrá resolverlas manualmente. Las otras <strong>{discardedRows.length}</strong> filas sin coincidencia se omitieron automáticamente.
                      </span>
                    </div>
                  )}

                  {unmatchedRows.length === 0 && matchedRows.length > 0 && (
                    <div className="message success" style={{ marginTop: 12 }}>
                      <CheckCircle2 size={16} />
                      <span>¡Todas las filas tienen coincidencia exacta o fueron filtradas! Puede avanzar directamente a la vista previa.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 3: RESOLVE UNKNOWN ITEMS ── */}
          {currentStep === 3 && (
            <div className="smart-wizard-step-content">
              <h3>Paso 4: Resolver ítems desconocidos</h3>

              {uniqueUnmatched.length === 0 ? (
                <div className="message success" style={{ marginTop: 12 }}>
                  <CheckCircle2 size={16} />
                  <span>
                    {Object.keys(resolutions).length > 0
                      ? `¡Todas las descripciones han sido resueltas! (${Object.keys(resolutions).length} resueltas, ${skippedDescriptions.size} omitidas)`
                      : 'No hay ítems pendientes de resolver. Puede avanzar a la vista previa.'
                    }
                  </span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                      Ítem {resolveIndex + 1} de {uniqueUnmatched.length} pendientes
                      {Object.keys(resolutions).length > 0 && ` · ${Object.keys(resolutions).length} resueltos`}
                      {skippedDescriptions.size > 0 && ` · ${skippedDescriptions.size} omitidos`}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-success"
                        onClick={handleExportUnmatchedExcel}
                        style={{ fontSize: '0.8rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      >
                        <Download size={14} /> Exportar Pendientes
                      </button>
                      <button
                        className="btn-outline"
                        onClick={handleSkipAll}
                        style={{ fontSize: '0.8rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      >
                        <SkipForward size={14} /> Omitir todos
                      </button>
                    </div>
                  </div>

                  {currentUnmatched && (
                    <div className="smart-wizard-resolve-card">
                      <div className="resolve-card-header">
                        <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
                        <span>Descripción no reconocida:</span>
                      </div>
                      <div className="resolve-card-description">
                        "{currentUnmatched}"
                      </div>

                      {/* Fuzzy suggestions */}
                      {fuzzyResults.length > 0 ? (
                        <div className="resolve-card-suggestions">
                          <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600 }}>
                            Coincidencias sugeridas:
                          </p>
                          {fuzzyResults.map((result, idx) => (
                            <div key={idx} className="resolve-suggestion-row">
                              <div className="resolve-suggestion-info">
                                <strong>{result.codigo}</strong>
                                <span>{result.nombre}</span>
                                <span className="resolve-score">{Math.round(result.score * 100)}%</span>
                              </div>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => handleResolve(currentUnmatched, result.codigo)}
                                disabled={savingSynonym}
                              >
                                <Check size={14} /> Asignar
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '12px 0' }}>
                          No se encontraron coincidencias similares.
                        </p>
                      )}

                      {/* Manual search */}
                      <div className="resolve-card-manual">
                        <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600 }}>
                          O busque manualmente:
                        </p>
                        <input
                          type="text"
                          placeholder="Buscar por código o nombre..."
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          style={{ width: '100%', marginBottom: 8 }}
                        />
                        {searchFilter.trim().length >= 2 && (
                          <div className="resolve-manual-results">
                            {productsList
                              .filter(p => {
                                const term = searchFilter.toLowerCase();
                                return p.codigo.toLowerCase().includes(term) || p.nombre.toLowerCase().includes(term);
                              })
                              .slice(0, 8)
                              .map((p, idx) => (
                                <div key={idx} className="resolve-suggestion-row">
                                  <div className="resolve-suggestion-info">
                                    <strong>{p.codigo}</strong>
                                    <span>{p.nombre}</span>
                                  </div>
                                  <button
                                    className="btn-primary btn-sm"
                                    onClick={() => {
                                      handleResolve(currentUnmatched, p.codigo);
                                      setSearchFilter('');
                                    }}
                                    disabled={savingSynonym}
                                  >
                                    <Check size={14} /> Asignar
                                  </button>
                                </div>
                              ))
                            }
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <button
                          className="btn-outline"
                          onClick={() => handleSkip(currentUnmatched)}
                          style={{ fontSize: '0.85rem' }}
                        >
                          <SkipForward size={14} /> Omitir este ítem
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 4: PREVIEW ── */}
          {currentStep === 4 && (
            <div className="smart-wizard-step-content">
              <h3>Paso 5: Vista previa</h3>

              <div className="smart-wizard-stats-grid">
                <div className="smart-wizard-stat success">
                  <span className="stat-number">{previewData.filter(r => r._valid).length}</span>
                  <span className="stat-label">Listos para importar</span>
                </div>
                <div 
                  className="smart-wizard-stat warning clickable-stat-card"
                  onClick={handleExportIncompleteExcel}
                  title="Descargar datos incompletos en Excel"
                >
                  <span className="stat-number">{previewData.filter(r => !r._valid).length}</span>
                  <span className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    Datos incompletos <Download size={14} />
                  </span>
                </div>
                <div className="smart-wizard-stat">
                  <span className="stat-number">{skippedDescriptions.size}</span>
                  <span className="stat-label">Omitidos</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="btn-outline" onClick={handleExportPreview} style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                  <Download size={14} /> Exportar Vista Previa
                </button>
              </div>

              <div className="table-container" style={{ maxHeight: '400px', overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Transaction Key</th>
                      <th>Fecha</th>
                      <th>ID Producto</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Unidad</th>
                      <th>Tipo</th>
                      {pipelineType === 'salidas' && <th>Almacenero</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData
                      .slice((previewPage - 1) * previewRowsPerPage, previewPage * previewRowsPerPage)
                      .map((row, idx) => (
                        <tr key={idx} className={!row._valid ? 'row-invalid' : row.matchType === 'resolved' ? 'row-resolved' : ''}>
                          <td>
                            <span className={`match-badge ${row.matchType}`}>
                              {row.matchType === 'auto' ? '✓ Auto' : '✎ Manual'}
                            </span>
                          </td>
                          <td><small>{row.transactionKey}</small></td>
                          <td>{row.fecha}</td>
                          <td><strong>{row.productCodigo}</strong></td>
                          <td>{row.productName}</td>
                          <td>{row.cantidad}</td>
                          <td>{row.unidad}</td>
                          <td className={row.tipo === 'INGRESO' ? 'text-success' : 'text-danger'}>
                            <strong>{row.tipo === 'INGRESO' ? 'Ingreso' : 'Salida'}</strong>
                          </td>
                          {pipelineType === 'salidas' && <td><small>{row.almacenero}</small></td>}
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {previewData.length > previewRowsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                  <button
                    className="btn-outline"
                    disabled={previewPage <= 1}
                    onClick={() => setPreviewPage(p => p - 1)}
                    style={{ padding: '4px 12px' }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ padding: '4px 12px', color: 'var(--text-secondary)' }}>
                    Página {previewPage} de {Math.ceil(previewData.length / previewRowsPerPage)}
                  </span>
                  <button
                    className="btn-outline"
                    disabled={previewPage >= Math.ceil(previewData.length / previewRowsPerPage)}
                    onClick={() => setPreviewPage(p => p + 1)}
                    style={{ padding: '4px 12px' }}
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: IMPORT ── */}
          {currentStep === 5 && (
            <div className="smart-wizard-step-content">
              <h3>Paso 6: Importación</h3>

              {isImporting && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Loader2 size={40} className="spin-animation" style={{ color: 'var(--accent)' }} />
                  <p style={{ marginTop: 12 }}>Importando movimientos al sistema...</p>
                </div>
              )}

              {importError && (
                <div className="message error" style={{ marginTop: 12 }}>
                  <AlertCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importResult && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: 12 }} />
                  <h3 style={{ margin: '0 0 16px' }}>¡Importación completada!</h3>

                  <div className="smart-wizard-stats-grid">
                    <div className="smart-wizard-stat success">
                      <span className="stat-number">{importResult.inserted}</span>
                      <span className="stat-label">Nuevos registros</span>
                    </div>
                    {importResult.updated > 0 && (
                      <div className="smart-wizard-stat">
                        <span className="stat-number">{importResult.updated}</span>
                        <span className="stat-label">Actualizados</span>
                      </div>
                    )}
                    {importResult.skipped > 0 && (
                      <div className="smart-wizard-stat warning">
                        <span className="stat-number">{importResult.skipped}</span>
                        <span className="stat-label">Omitidos</span>
                      </div>
                    )}
                  </div>

                  {importResult.skippedDupes > 0 && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                      {importResult.skippedDupes} claves duplicadas omitidas
                    </p>
                  )}
                  {importResult.insufficientStock > 0 && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--warning)', marginTop: 4 }}>
                      {importResult.insufficientStock} filas omitidas por stock insuficiente
                    </p>
                  )}

                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (onImportComplete) onImportComplete();
                      onClose();
                    }}
                    style={{ marginTop: 20 }}
                  >
                    Cerrar Wizard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {currentStep < 5 && (
          <div className="smart-wizard-footer">
            <button
              className="btn-outline"
              onClick={currentStep === 0 ? onClose : handleBack}
            >
              {currentStep === 0 ? 'Cancelar' : <><ArrowLeft size={16} /> Anterior</>}
            </button>

            <button
              className="btn-primary"
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              {currentStep === 4 ? (
                <><Zap size={16} /> Importar ({previewData.filter(r => r._valid).length} filas)</>
              ) : (
                <>Siguiente <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        )}
        {confirmDialog && (
          <div className="custom-confirm-overlay">
            <div className="custom-confirm-card">
              <div className="custom-confirm-header">
                <h3>{confirmDialog.title}</h3>
              </div>
              <div className="custom-confirm-body">
                <p>{confirmDialog.message}</p>
              </div>
              <div className="custom-confirm-actions">
                <button
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.875rem', cursor: 'pointer' }}
                  onClick={() => {
                    if (confirmDialog.onCancel) confirmDialog.onCancel();
                    setConfirmDialog(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.875rem', cursor: 'pointer' }}
                  onClick={() => {
                    if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
