import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Grid, CheckCircle2, AlertCircle,
  ArrowRight, ArrowLeft, X, Loader2, Zap, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  CABLE_SCHEDULE_COLUMNS, CABLE_DESPACHO_COLUMNS,
  CABLE_SCHEDULE_SIGNATURES, CABLE_DESPACHO_SIGNATURES,
  detectImportType, autoMapColumns, transformRow
} from './cableParserConfig';
import { findMatchingProfileByHeaders, fetchMappingProfiles, saveOrUpdateProfile } from '../smartimport/mappingPersistence';


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

  // Step 2: Column Mapping
  const [mapping, setMapping] = useState({});
  const [detectedType, setDetectedType] = useState(null);

  // Step 3: Preview
  const [previewData, setPreviewData] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
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

  const columnDefs = importType === 'schedule' ? CABLE_SCHEDULE_COLUMNS : CABLE_DESPACHO_COLUMNS;

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

    // Find header row (first row with > 3 non-empty cells)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, json.length); i++) {
      const nonEmpty = json[i].filter(c => c !== '').length;
      if (nonEmpty >= 3) {
        headerRowIdx = i;
        break;
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
      const defs = detected === 'schedule' ? CABLE_SCHEDULE_COLUMNS : CABLE_DESPACHO_COLUMNS;
      const autoMap = autoMapColumns(headers, defs);
      setMapping(autoMap);
    }

    setFileError('');
  }, [forceType]);

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

    rawRows.forEach((row, i) => {
      const obj = transformRow(row, mapping, columnDefs);
      if (!obj.tag_unico) return;

      if (importType === 'schedule') {
        // Hardcode servicio to 'PAT'
        obj.servicio = 'PAT';

        // Filter material: keep only CABLE DESNUDO 2/0 AWG and CABLE DESNUDO 4/0 AWG
        const mat = (obj.material || '').toString().trim().toUpperCase();
        if (mat !== 'CABLE DESNUDO 2/0 AWG' && mat !== 'CABLE DESNUDO 4/0 AWG') {
          return; // skip this row
        }
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
      const table = importType === 'schedule' ? 'cable_schedule' : 'cable_despachos';
      const BATCH_SIZE = 100;
      let inserted = 0;
      let updated = 0;
      let errors = 0;

      for (let i = 0; i < previewData.length; i += BATCH_SIZE) {
        const batch = previewData.slice(i, i + BATCH_SIZE);

        if (importType === 'schedule') {
          // Upsert on tag_unico for cable_schedule
          const { data, error } = await supabase
            .from(table)
            .upsert(batch.map(row => ({
              ...row,
              updated_at: new Date().toISOString(),
            })), {
              onConflict: 'tag_unico',
              ignoreDuplicates: false,
            });

          if (error) throw error;
          inserted += batch.length;
        } else {
          // Insert for cable_despachos (multiple despachos per tag_unico)
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
  }, [previewData, importType]);

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
      <div className="smart-wizard-modal cable-import-modal">
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
              <div key={i} className={`step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                <div className="step-circle">
                  {isDone ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                </div>
                <span className="step-label">{step.label}</span>
                {i < STEPS.length - 1 && <div className="step-connector" />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="smart-wizard-body">
          {/* ── STEP 0: FILE UPLOAD ── */}
          {currentStep === 0 && (
            <div className="import-step">
              <div
                className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
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
                  <div className="upload-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Procesando archivo...</p>
                  </div>
                ) : fileName ? (
                  <div className="upload-success">
                    <FileSpreadsheet size={32} />
                    <p><strong>{fileName}</strong></p>
                    <p className="text-muted">{rawRows.length} filas · {rawHeaders.length} columnas</p>
                  </div>
                ) : (
                  <div className="upload-prompt">
                    <Upload size={40} />
                    <p><strong>Arrastra tu archivo aquí</strong></p>
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
              {rawHeaders.length > 0 && (
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
                      {isMapped && (
                        <div className="cable-mapping-preview">
                          Ej: {String(rawRows[0]?.[mappedIdx] ?? '').slice(0, 30)}
                        </div>
                      )}
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
              <div className="cable-preview-stats">
                <div className="cable-preview-stat success">
                  <CheckCircle2 size={16} />
                  <span>{previewData.length} filas válidas</span>
                </div>
                {validationErrors.length > 0 && (
                  <div className="cable-preview-stat warning">
                    <AlertCircle size={16} />
                    <span>{validationErrors.length} advertencias</span>
                  </div>
                )}
              </div>

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
                      <span className="cable-import-stat-label">
                        {importType === 'schedule' ? 'Insertados/Actualizados' : 'Insertados'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="smart-wizard-footer">
          {currentStep > 0 && currentStep < 3 && (
            <button className="btn btn-secondary" onClick={handleBack}>
              <ArrowLeft size={14} /> Anterior
            </button>
          )}
          <div style={{ flex: 1 }} />
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
            <button className="btn btn-primary" onClick={handleClose}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
