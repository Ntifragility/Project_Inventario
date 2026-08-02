import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Grid, CheckCircle2, AlertCircle,
  ArrowRight, ArrowLeft, X, Loader2, Zap, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  CABLE_SCHEDULE_COLUMNS, CABLE_DESPACHO_COLUMNS, CABLE_PAT_COLUMNS,
  CABLE_SCHEDULE_SIGNATURES, CABLE_DESPACHO_SIGNATURES, CABLE_PAT_SIGNATURES,
  detectImportType, autoMapColumns, transformRow, normalizeImportText
} from './cableParserConfig';
import { findMatchingProfileByHeaders, fetchMappingProfiles, saveOrUpdateProfile } from '../smartimport/mappingPersistence';
import { useProjectArea } from '../../contexts/ProjectAreaContext';


/**
 * CableImportWizard — 5-step modal wizard for importing Cable Schedule
 * and Cable Despacho spreadsheets.
 *
 * Props:
 * - onClose: () => void
 * - onImportComplete: () => void (refresh dashboard after import)
 * - forceType: 'schedule' | 'despacho' | null (pre-select import type)
 */
export default function CableImportWizard({ onClose, onImportComplete, forceType = null }) {
  const { activeArea, activeAreaId } = useProjectArea();
  // ── Wizard State ──
  const [currentStep, setCurrentStep] = useState(0);
  const [importType, setImportType] = useState(forceType); // 'schedule' | 'despacho'

  // Step 1: File Upload
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const fileInputRef = useRef(null);
  const workbookRef = useRef(null);

  const [mapping, setMapping] = useState({});
  const [detectedType, setDetectedType] = useState(null);
  const [profiles, setProfiles] = useState([]);

  // Fetch profiles on mount
  React.useEffect(() => {
    fetchMappingProfiles().then(data => setProfiles(data));
  }, []);

  // Step 3: Preview
  const [previewData, setPreviewData] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [previewSummary, setPreviewSummary] = useState({ conductores: 0, pvc: 0, unsupported: 0, missingTag: 0 });
  const [previewPage, setPreviewPage] = useState(1);
  const previewRowsPerPage = 20;

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const STEPS = [
    { label: 'Cargar Archivo', icon: Upload },
    { label: 'Mapeo de Columnas', icon: Grid },
    { label: 'Vista Previa', icon: FileSpreadsheet },
    { label: 'Importar', icon: Zap },
  ];

  const columnDefs = importType === 'schedule' ? CABLE_SCHEDULE_COLUMNS :
    importType === 'pat' ? CABLE_PAT_COLUMNS : CABLE_DESPACHO_COLUMNS;

  // ══════════════════════════════════════════════════════════════
  // STEP 1: FILE UPLOAD & SHEET PARSING
  // ══════════════════════════════════════════════════════════════

  const processFile = useCallback(async (file) => {
    setFileError('');
    setIsFileLoading(true);

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        throw new Error('Formato no soportado. Use .xlsx, .xls o .csv');
      }

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      workbookRef.current = wb;

      setFileName(file.name);
      setSheets(wb.SheetNames);

      // Auto-select first sheet
      const sheetName = wb.SheetNames[0];
      setSelectedSheet(sheetName);
      parseSheet(wb, sheetName);
    } catch (err) {
      setFileError(err.message || 'Error al leer el archivo');
    } finally {
      setIsFileLoading(false);
    }
  }, []);

  const parseSheet = useCallback((wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (json.length < 2) {
      setFileError('El archivo no contiene datos suficientes');
      return;
    }

    // Find header row by checking signatures in the first 5 rows
    let headerRowIdx = 0;
    let maxScore = 0;

    for (let i = 0; i < Math.min(5, json.length); i++) {
      const rowHeaders = json[i].map(normalizeImportText);

      const scheduleHits = CABLE_SCHEDULE_SIGNATURES.filter(sig => rowHeaders.some(h => h.includes(sig))).length;
      const despachoHits = CABLE_DESPACHO_SIGNATURES.filter(sig => rowHeaders.some(h => h.includes(sig))).length;
      const patHits = CABLE_PAT_SIGNATURES.filter(sig => rowHeaders.some(h => h.includes(sig))).length;

      const score = Math.max(scheduleHits, despachoHits, patHits);

      if (score > maxScore) {
        maxScore = score;
        headerRowIdx = i;
      }
    }

    // Fallback if no signatures match, use the row with most non-empty strings
    if (maxScore === 0) {
      let maxNonEmpty = 0;
      for (let i = 0; i < Math.min(5, json.length); i++) {
        const nonEmpty = json[i].filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
        if (nonEmpty > maxNonEmpty) {
          maxNonEmpty = nonEmpty;
          headerRowIdx = i;
        }
      }
    }

    const headers = json[headerRowIdx].map(h => String(h).trim());
    const dataRows = json.slice(headerRowIdx + 1).filter(row =>
      row.some(cell => cell !== '' && cell !== null && cell !== undefined)
    );

    setRawHeaders(headers);
    setRawRows(dataRows);

    // Auto-detect import type
    const detected = forceType || detectImportType(headers);
    setDetectedType(detected);
    if (detected) {
      setImportType(detected);
      const defs = detected === 'schedule' ? CABLE_SCHEDULE_COLUMNS :
        detected === 'pat' ? CABLE_PAT_COLUMNS : CABLE_DESPACHO_COLUMNS;

      const matchedProfile = findMatchingProfileByHeaders(headers, profiles, detected);

      if (matchedProfile && matchedProfile.column_mapping) {
        // Load mapping from profile by resolving header name strings to current indices
        const loadedMapping = {};
        Object.entries(matchedProfile.column_mapping).forEach(([headerName, fieldName]) => {
          const idx = headers.indexOf(headerName);
          if (idx !== -1) {
            loadedMapping[fieldName] = idx;
          }
        });

        // Fill missing required fields with autoMap
        const autoMap = autoMapColumns(headers, defs);
        setMapping({ ...autoMap, ...loadedMapping });
      } else {
        const autoMap = autoMapColumns(headers, defs);
        setMapping(autoMap);
      }
    }

    setFileError('');
  }, [forceType, profiles]);

  const handleSheetChange = useCallback((sheetName) => {
    setSelectedSheet(sheetName);
    if (workbookRef.current) {
      parseSheet(workbookRef.current, sheetName);
    }
  }, [parseSheet]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ══════════════════════════════════════════════════════════════
  // STEP 2: COLUMN MAPPING
  // ══════════════════════════════════════════════════════════════

  const handleMappingChange = useCallback((field, headerIdx) => {
    setMapping(prev => ({
      ...prev,
      [field]: headerIdx === '' ? undefined : parseInt(headerIdx, 10),
    }));
  }, []);

  const getMappingValidation = useCallback(() => {
    const errors = [];
    for (const [field, def] of Object.entries(columnDefs)) {
      if (def.required && (mapping[field] === undefined || mapping[field] === null)) {
        errors.push(`Campo obligatorio sin mapear: ${def.label}`);
      }
    }
    return errors;
  }, [mapping, columnDefs]);

  // ══════════════════════════════════════════════════════════════
  // STEP 3: PREVIEW & VALIDATION
  // ══════════════════════════════════════════════════════════════

  const buildPreview = useCallback(() => {
    const errors = [];
    const parsedRows = [];
    const summary = { conductores: 0, pvc: 0, unsupported: 0, missingTag: 0 };

    rawRows.forEach((row, i) => {
      const obj = transformRow(row, mapping, columnDefs);
      if (!obj.tag_unico) {
        summary.missingTag++;
        return;
      }

      if (importType === 'pat') {
        obj.tipo_cable = 'PAT';
      }

      if (importType === 'schedule') {
        obj.tipo_cable = 'CIRCUITO';
      }

      const desc = normalizeImportText(obj.material);

      if (importType === 'schedule' && !desc.startsWith('CABLE')) {
        summary.unsupported++;
        return;
      }

      if (importType === 'pat') {
        if (desc.startsWith('CABLE')) {
          summary.conductores++;
        } else if (desc.startsWith('TUBERIA PVC SCH')) {
          summary.pvc++;
        } else {
          summary.unsupported++;
          return;
        }
        obj.material = desc;
      }

      // Validate required fields
      for (const [field, def] of Object.entries(columnDefs)) {
        if (def.required && (obj[field] === null || obj[field] === undefined || obj[field] === '')) {
          errors.push(`Fila ${i + 1}: Campo "${def.label}" vacío o inválido`);
        }
      }

      parsedRows.push(obj);
    });

    setPreviewData(parsedRows);
    setPreviewSummary(summary);
    setValidationErrors(errors.slice(0, 50)); // Cap at 50 errors
    setPreviewPage(1);
  }, [rawRows, mapping, columnDefs, importType]);

  // ══════════════════════════════════════════════════════════════
  // STEP 4: IMPORT TO SUPABASE
  // ══════════════════════════════════════════════════════════════

  const executeImport = useCallback(async () => {
    setIsImporting(true);
    setImportError('');
    setImportProgress(0);

    try {
      const table = importType === 'despacho' ? 'cable_despachos' : 'cable_schedule';
      const BATCH_SIZE = 100;
      let inserted = 0;
      let updated = 0;

      // Save mapping profile
      const savedMapping = {};
      Object.entries(mapping).forEach(([field, idx]) => {
        if (idx !== undefined && idx !== null) {
          const headerName = rawHeaders[idx];
          if (headerName) {
            savedMapping[headerName] = field;
          }
        }
      });

      saveOrUpdateProfile({
        name: `Auto ${importType} (${new Date().toLocaleDateString()})`,
        type: importType,
        headers: rawHeaders,
        columnMapping: savedMapping
      });
      let errors = 0;

      for (let i = 0; i < previewData.length; i += BATCH_SIZE) {
        const batch = previewData.slice(i, i + BATCH_SIZE);

        if (importType === 'schedule' || importType === 'pat') {
          const batchTags = batch.map(row => row.tag_unico).filter(Boolean);
          const { data: existingRows, error: existingErr } = await supabase
            .from('cable_schedule')
            .select('tag_unico, project_area_id')
            .in('tag_unico', batchTags);

          if (existingErr) throw existingErr;
          const conflictingTags = (existingRows || [])
            .filter(row => row.project_area_id !== activeAreaId)
            .map(row => row.tag_unico);
          if (conflictingTags.length > 0) {
            const examples = conflictingTags.slice(0, 5).join(', ');
            throw new Error(`No se puede importar en ${activeArea?.name || 'esta area'}: los TAG ${examples}${conflictingTags.length > 5 ? '...' : ''} ya pertenecen a otra area.`);
          }
          const existingTags = new Set((existingRows || [])
            .filter(row => row.project_area_id === activeAreaId)
            .map(row => row.tag_unico));

          // Extract despachado if present
          const scheduleBatch = batch.map(row => {
            const copy = { ...row };
            delete copy.total_despachado_m;
            return {
              ...copy,
              project_area_id: activeAreaId,
              updated_at: new Date().toISOString(),
            };
          });

          // Upsert on tag_unico for cable_schedule
          const { error } = await supabase
            .from('cable_schedule')
            .upsert(scheduleBatch, {
              onConflict: 'tag_unico',
              ignoreDuplicates: false,
            });

          if (error) throw error;

          // If there is total_despachado_m mapped, insert/upsert into cable_despachos
          const despachadoRows = batch
            .filter(row => row.total_despachado_m !== undefined && parseFloat(row.total_despachado_m) > 0)
            .map(row => ({
              tag_unico: row.tag_unico,
              longitud_despachada_m: parseFloat(row.total_despachado_m),
              vale_almacen: 'IMPORT_PAT',
              fecha_entrega: new Date().toISOString().split('T')[0]
            }));

          if (despachadoRows.length > 0) {
            // Delete old despachos for these tags first
            const tagsToDelete = despachadoRows.map(r => r.tag_unico);
            await supabase
              .from('cable_despachos')
              .delete()
              .in('tag_unico', tagsToDelete);

            const { error: despErr } = await supabase
              .from('cable_despachos')
              .insert(despachadoRows);
            if (despErr) throw despErr;
          }

          inserted += batchTags.filter(tag => !existingTags.has(tag)).length;
          updated += batchTags.filter(tag => existingTags.has(tag)).length;
        } else {
          const batchTags = batch.map(row => row.tag_unico).filter(Boolean);
          const { data: parentRows, error: parentError } = await supabase
            .from('cable_schedule')
            .select('tag_unico')
            .eq('project_area_id', activeAreaId)
            .in('tag_unico', batchTags);

          if (parentError) throw parentError;
          const parentTags = new Set((parentRows || []).map(row => row.tag_unico));
          const missingTags = batchTags.filter(tag => !parentTags.has(tag));
          if (missingTags.length > 0) {
            const examples = missingTags.slice(0, 5).join(', ');
            throw new Error(`No se puede importar despachos en ${activeArea?.name || 'esta area'}: los TAG ${examples}${missingTags.length > 5 ? '...' : ''} no existen en el Cable Schedule de esta area.`);
          }

          // Simulated upsert: delete existing records for these tags first to prevent duplicate entries
          const tagsToDelete = batchTags;
          if (tagsToDelete.length > 0) {
            const { error: delErr } = await supabase
              .from('cable_despachos')
              .delete()
              .in('tag_unico', tagsToDelete);
            if (delErr) throw delErr;
          }

          const { data, error } = await supabase
            .from(table)
            .insert(batch);

          if (error) throw error;
          inserted += batch.length;
        }

        setImportProgress(Math.round(((i + batch.length) / previewData.length) * 100));
      }

      setImportResult({
        total: previewData.length,
        inserted,
        updated,
        errors,
      });
    } catch (err) {
      console.error('Import error:', err);
      setImportError(err.message || 'Error durante la importación');
    } finally {
      setIsImporting(false);
    }
  }, [activeArea, activeAreaId, previewData, importType, mapping, rawHeaders]);

  // ══════════════════════════════════════════════════════════════
  // STEP NAVIGATION
  // ══════════════════════════════════════════════════════════════

  const canAdvance = () => {
    switch (currentStep) {
      case 0: return rawHeaders.length > 0 && importType;
      case 1: return getMappingValidation().length === 0;
      case 2: return previewData.length > 0;
      case 3: return !!importResult;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      buildPreview();
    }
    if (currentStep === 2) {
      executeImport();
    }
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    if (importResult) onImportComplete?.();
    onClose?.();
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="smart-wizard-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="smart-wizard-container cable-import-modal">
        {/* Header */}
        <div className="smart-wizard-header">
          <h3>
            {importType === 'schedule' ? '📋 Importar Cable Schedule' :
              importType === 'despacho' ? '📦 Importar Despachos' :
                '📋 Importar Cables'}
          </h3>
          <button className="smart-wizard-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="smart-wizard-stepper">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === currentStep;
            const isDone = i < currentStep;
            return (
              <React.Fragment key={i}>
                <div className={`smart-wizard-step ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}>
                  <div className="smart-wizard-step-icon">
                    {isDone ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                  </div>
                  <span className="smart-wizard-step-label">{step.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`smart-wizard-step-connector ${isDone ? 'completed' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="smart-wizard-body">
          {/* ── STEP 0: FILE UPLOAD ── */}
          {currentStep === 0 && (
            <div className="import-step">
              <div
                className={`smart-wizard-dropzone ${isDragging ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
                {isFileLoading ? (
                  <div className="smart-wizard-dropzone-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Procesando archivo...</p>
                  </div>
                ) : fileName ? (
                  <div className="smart-wizard-dropzone-success">
                    <FileSpreadsheet size={32} color="var(--success)" />
                    <p><strong>{fileName}</strong></p>
                    <p className="text-muted">{rawRows.length} filas · {rawHeaders.length} columnas</p>
                  </div>
                ) : (
                  <div className="smart-wizard-dropzone-prompt">
                    <Upload size={40} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
                    <p style={{ fontSize: '1.1rem', fontWeight: '600' }}><strong>Arrastra tu archivo aquí</strong></p>
                    <p className="text-muted">o haz clic para seleccionar (.xlsx, .xls, .csv)</p>
                  </div>
                )}
              </div>

              {fileError && (
                <div className="message danger" style={{ marginTop: 12 }}>
                  <AlertCircle size={16} />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Sheet selector */}
              {sheets.length > 1 && (
                <div className="cable-sheet-selector">
                  <label>Hoja de Excel:</label>
                  <select value={selectedSheet} onChange={e => handleSheetChange(e.target.value)}>
                    {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Import type selector */}
              {rawHeaders.length > 0 && !forceType && (
                <div className="cable-type-selector">
                  <label>Tipo de importación:</label>
                  <div className="cable-type-buttons">
                    <button
                      className={`cable-type-btn ${importType === 'schedule' ? 'active' : ''}`}
                      onClick={() => {
                        setImportType('schedule');
                        setMapping(autoMapColumns(rawHeaders, CABLE_SCHEDULE_COLUMNS));
                      }}
                    >
                      📋 Cable Schedule
                      {detectedType === 'schedule' && <span className="auto-badge">Auto-detectado</span>}
                    </button>
                    <button
                      className={`cable-type-btn ${importType === 'pat' ? 'active' : ''}`}
                      onClick={() => {
                        setImportType('pat');
                        setMapping(autoMapColumns(rawHeaders, CABLE_PAT_COLUMNS));
                      }}
                    >
                      ⚡ Puesta a Tierra
                      {detectedType === 'pat' && <span className="auto-badge">Auto-detectado</span>}
                    </button>
                    <button
                      className={`cable-type-btn ${importType === 'despacho' ? 'active' : ''}`}
                      onClick={() => {
                        setImportType('despacho');
                        setMapping(autoMapColumns(rawHeaders, CABLE_DESPACHO_COLUMNS));
                      }}
                    >
                      📦 Despachos
                      {detectedType === 'despacho' && <span className="auto-badge">Auto-detectado</span>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: COLUMN MAPPING ── */}
          {currentStep === 1 && (
            <div className="import-step">
              <p className="step-description">
                Verifica que las columnas del archivo se corresponden con los campos del sistema.
                Los campos con <span className="required-marker">*</span> son obligatorios.
              </p>

              <div className="cable-mapping-grid">
                {Object.entries(columnDefs).map(([field, def]) => {
                  const mappedIdx = mapping[field];
                  const isMapped = mappedIdx !== undefined && mappedIdx !== null;

                  return (
                    <div className={`cable-mapping-row ${def.required ? 'required' : ''} ${isMapped ? 'mapped' : 'unmapped'}`} key={field}>
                      <div className="cable-mapping-label">
                        {def.required && <span className="required-marker">*</span>}
                        {def.label}
                        <span className="cable-mapping-type">{def.type}</span>
                      </div>
                      <div className="cable-mapping-arrow">→</div>
                      <select
                        className="cable-mapping-select"
                        value={isMapped ? mappedIdx : ''}
                        onChange={e => handleMappingChange(field, e.target.value)}
                      >
                        <option value="">— Sin mapear —</option>
                        {rawHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>
                        ))}
                      </select>
                      {/* Preview removed */}
                    </div>
                  );
                })}
              </div>

              {getMappingValidation().length > 0 && (
                <div className="message warning" style={{ marginTop: 12 }}>
                  <AlertCircle size={16} />
                  <div>
                    {getMappingValidation().map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: PREVIEW ── */}
          {currentStep === 2 && (
            <div className="import-step">
              <div className="cable-preview-stats" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div className="cable-preview-stat success" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', padding: '6px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} />
                  <span>{previewData.length} filas válidas</span>
                </div>
                {validationErrors.length > 0 && (
                  <div className="cable-preview-stat warning" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '6px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={16} />
                    <span>{validationErrors.length} advertencias</span>
                  </div>
                )}
              </div>

              {importType === 'pat' && (
                <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <div className="cable-preview-stat" style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <strong>{previewSummary.conductores}</strong>
                    <div className="text-muted" style={{ fontSize: 12 }}>Conductores CABLE</div>
                  </div>
                  <div className="cable-preview-stat" style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <strong>{previewSummary.pvc}</strong>
                    <div className="text-muted" style={{ fontSize: 12 }}>Tuberías PVC SCH</div>
                  </div>
                  <div className="cable-preview-stat" style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <strong>{previewSummary.unsupported + previewSummary.missingTag}</strong>
                    <div className="text-muted" style={{ fontSize: 12 }}>Filas omitidas</div>
                  </div>
                </div>
                {(previewSummary.unsupported > 0 || previewSummary.missingTag > 0) && (
                  <div className="message warning" style={{ marginBottom: 16 }}>
                    <AlertCircle size={16} />
                    <span>
                      Se omitieron {previewSummary.unsupported} filas porque el material no empieza con CABLE o TUBERIA PVC SCH
                      {previewSummary.missingTag > 0 ? `, y ${previewSummary.missingTag} filas sin TAG UNICO` : ''}.
                    </span>
                  </div>
                )}
                </>
              )}

              {validationErrors.length > 0 && (
                <details className="cable-validation-details">
                  <summary>Ver advertencias ({validationErrors.length})</summary>
                  <div className="cable-validation-list">
                    {validationErrors.slice(0, 20).map((err, i) => (
                      <div key={i} className="cable-validation-item">{err}</div>
                    ))}
                    {validationErrors.length > 20 && (
                      <div className="cable-validation-item text-muted">
                        ...y {validationErrors.length - 20} más
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Preview table */}
              <div className="cable-preview-table-wrapper">
                <table className="cable-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {Object.entries(columnDefs)
                        .filter(([f]) => mapping[f] !== undefined)
                        .map(([field, def]) => (
                          <th key={field}>{def.label}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData
                      .slice((previewPage - 1) * previewRowsPerPage, previewPage * previewRowsPerPage)
                      .map((row, i) => (
                        <tr key={i}>
                          <td className="text-muted">{(previewPage - 1) * previewRowsPerPage + i + 1}</td>
                          {Object.entries(columnDefs)
                            .filter(([f]) => mapping[f] !== undefined)
                            .map(([field]) => (
                              <td key={field}>
                                {row[field] !== null && row[field] !== undefined
                                  ? String(row[field])
                                  : <span className="text-muted">—</span>}
                              </td>
                            ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {previewData.length > previewRowsPerPage && (
                <div className="cable-preview-pagination">
                  <button disabled={previewPage <= 1} onClick={() => setPreviewPage(p => p - 1)}>
                    <ArrowLeft size={14} /> Anterior
                  </button>
                  <span>
                    Página {previewPage} de {Math.ceil(previewData.length / previewRowsPerPage)}
                  </span>
                  <button
                    disabled={previewPage >= Math.ceil(previewData.length / previewRowsPerPage)}
                    onClick={() => setPreviewPage(p => p + 1)}
                  >
                    Siguiente <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: IMPORT ── */}
          {currentStep === 3 && (
            <div className="import-step">
              {isImporting && (
                <div className="cable-importing">
                  <Loader2 size={40} className="spin" />
                  <p>Importando datos a Supabase...</p>
                  <div className="cable-progress-bar">
                    <div className="cable-progress-fill" style={{ width: `${importProgress}%` }} />
                  </div>
                  <span className="text-muted">{importProgress}%</span>
                </div>
              )}

              {importError && (
                <div className="message danger">
                  <AlertCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importResult && (
                <div className="cable-import-result">
                  <div className="cable-import-success-icon">
                    <CheckCircle2 size={48} />
                  </div>
                  <h4>¡Importación completada!</h4>
                  <div className="cable-import-stats">
                    <div className="cable-import-stat">
                      <span className="cable-import-stat-value">{importResult.total}</span>
                      <span className="cable-import-stat-label">Total procesados</span>
                    </div>
                    <div className="cable-import-stat">
                      <span className="cable-import-stat-value">{importResult.inserted}</span>
                      <span className="cable-import-stat-label">Nuevos</span>
                    </div>
                    {(importType === 'schedule' || importType === 'pat') && (
                      <div className="cable-import-stat">
                        <span className="cable-import-stat-value">{importResult.updated}</span>
                        <span className="cable-import-stat-label">Actualizados</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="smart-wizard-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ color: 'var(--danger)' }}>
              Cancelar
            </button>
            {currentStep > 0 && currentStep < 3 && (
              <button className="btn btn-secondary" onClick={handleBack}>
                <ArrowLeft size={14} /> Anterior
              </button>
            )}
          </div>
          {currentStep < 3 && (
            <button
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              {currentStep === 2 ? 'Importar' : 'Siguiente'} <ArrowRight size={14} />
            </button>
          )}
          {currentStep === 3 && importResult && (
            <button className="btn btn-primary" onClick={onClose}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
