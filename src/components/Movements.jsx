import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Save, Upload, AlertCircle, CheckCircle2, Info, X, Eye, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Movements({ user }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState('INGRESO');
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [almacenero, setAlmacenero] = useState('');
  
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
  const [excelMsg, setExcelMsg] = useState({ text: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  // Import preview states (FUNC-3)
  const [importPreview, setImportPreview] = useState(null); // { type: 'ingreso'|'salida', data: [], insertCount, updateCount, skippedInfo, inputRef }
  const [importExecuting, setImportExecuting] = useState(false);

  // Undo import state
  const [lastImport, setLastImport] = useState(null); // { type: 'ingreso' | 'salida', keys: [], prevRecords: [], newKeys: [] }
  const [undoing, setUndoing] = useState(false);

  // Compact Import Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [importOption, setImportOption] = useState(null); // 'ingreso' | 'salida'

  // Movements History Admin States
  const [adminDni, setAdminDni] = useState('');
  const [ledgerMovements, setLedgerMovements] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerMsg, setLedgerMsg] = useState({ text: '', type: '' });
  
  // Filters
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [ledgerType, setLedgerType] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  
  // Pagination
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerRowsPerPage, setLedgerRowsPerPage] = useState(25);

  // Edit / Delete Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionTarget, setActionTarget] = useState(null); // the movement object
  const [actionQty, setActionQty] = useState('');
  const [actionDni, setActionDni] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch movements list
  const fetchLedgerMovements = async () => {
    setLedgerLoading(true);
    setLedgerError('');
    try {
      let query = supabase
        .from('movimientos')
        .select(`
          id,
          producto_codigo,
          fecha,
          tipo,
          cantidad,
          observaciones,
          usuario,
          key,
          created_at,
          producto:productos(nombre, unidades(nombre))
        `)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      if (ledgerDateFrom) {
        query = query.gte('fecha', ledgerDateFrom);
      }
      if (ledgerDateTo) {
        query = query.lte('fecha', ledgerDateTo);
      }
      if (ledgerType) {
        query = query.eq('tipo', ledgerType);
      }
      
      const { data, error } = await query;
      if (error) throw error;

      let formatted = (data || []).map(m => ({
        id: m.id,
        fecha: m.fecha.split('-').reverse().join('/'),
        fechaRaw: m.fecha,
        key: m.key || '',
        codigo: m.producto_codigo || '',
        producto: m.producto ? m.producto.nombre : 'Producto no encontrado',
        unidad: m.producto && m.producto.unidades ? m.producto.unidades.nombre : '',
        tipo: m.tipo,
        cantidad: parseFloat(m.cantidad) || 0,
        observaciones: m.observaciones || '',
        usuario: m.usuario
      }));

      if (ledgerSearch.trim()) {
        const term = ledgerSearch.toLowerCase().trim();
        formatted = formatted.filter(m => 
          m.producto.toLowerCase().includes(term) ||
          m.codigo.toLowerCase().includes(term) ||
          m.key.toLowerCase().includes(term) ||
          m.observaciones.toLowerCase().includes(term)
        );
      }

      setLedgerMovements(formatted);
      setLedgerPage(1);
    } catch (err) {
      console.error('Error fetching movements ledger:', err);
      setLedgerError('Error al cargar historial: ' + err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Set default dates on mount and fetch
  useEffect(() => {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    setLedgerDateFrom(monthAgo.toISOString().slice(0, 10));
    setLedgerDateTo(today.toISOString().slice(0, 10));
  }, []);

  // Fetch whenever dates or type change
  useEffect(() => {
    if (ledgerDateFrom && ledgerDateTo) {
      fetchLedgerMovements();
    }
  }, [ledgerDateFrom, ledgerDateTo, ledgerType]);

  // Handle Delete Click
  const handleDeleteClick = (mov) => {
    setActionTarget(mov);
    setActionDni(adminDni);
    setActionError('');
    setShowDeleteModal(true);
  };

  // Confirm Delete Action
  const handleConfirmDelete = async () => {
    if (!actionTarget) return;
    const finalDni = actionDni.trim();
    if (!finalDni) {
      setActionError('El DNI de administrador es obligatorio.');
      return;
    }
    
    setActionLoading(true);
    setActionError('');
    try {
      const { error } = await supabase.rpc('eliminar_movimiento_autorizado', {
        p_movimiento_id: actionTarget.id,
        p_admin_dni: finalDni
      });

      if (error) throw error;

      setAdminDni(finalDni);
      setLedgerMsg({ text: 'Movimiento eliminado correctamente. El stock ha sido recalculado.', type: 'success' });
      setShowDeleteModal(false);
      setActionTarget(null);
      fetchLedgerMovements();
    } catch (err) {
      console.error('Error deleting movement:', err);
      setActionError(err.message || 'Error al eliminar');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Edit Click
  const handleEditClick = (mov) => {
    setActionTarget(mov);
    setActionQty(mov.cantidad.toString());
    setActionDni(adminDni);
    setActionError('');
    setShowEditModal(true);
  };

  // Confirm Edit Action
  const handleConfirmEdit = async () => {
    if (!actionTarget) return;
    const finalDni = actionDni.trim();
    const newQty = parseFloat(actionQty);
    
    if (!finalDni) {
      setActionError('El DNI de administrador es obligatorio.');
      return;
    }
    if (isNaN(newQty) || newQty <= 0) {
      setActionError('La cantidad debe ser un número válido mayor a cero.');
      return;
    }

    setActionLoading(true);
    setActionError('');
    try {
      const { error } = await supabase.rpc('editar_movimiento_autorizado', {
        p_movimiento_id: actionTarget.id,
        p_nueva_cantidad: newQty,
        p_admin_dni: finalDni
      });

      if (error) throw error;

      setAdminDni(finalDni);
      setLedgerMsg({ text: 'Movimiento actualizado correctamente. El stock ha sido recalculado.', type: 'success' });
      setShowEditModal(false);
      setActionTarget(null);
      fetchLedgerMovements();
    } catch (err) {
      console.error('Error editing movement:', err);
      setActionError(err.message || 'Error al actualizar');
    } finally {
      setActionLoading(false);
    }
  };

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

  // Form submit handler — uses atomic server-side RPC to prevent race conditions
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormMsg({ text: '', type: '' });

    const codeClean = codigo.trim().toUpperCase();
    const qtyClean = parseFloat(cantidad);

    if (!codeClean || !fecha || isNaN(qtyClean) || qtyClean <= 0) {
      setFormMsg({ text: 'Campos obligatorios incompletos o cantidad inválida.', type: 'error' });
      return;
    }

    // Input length validation (SEC-5)
    if (observaciones.length > 1000) {
      setFormMsg({ text: 'Las observaciones no pueden exceder 1000 caracteres.', type: 'error' });
      return;
    }

    let finalObs = observaciones.trim();
    if (tipo === 'SALIDA') {
      const almaceneroClean = almacenero.trim();
      if (!almaceneroClean) {
        setFormMsg({ text: 'El código de almacenero es obligatorio para salidas.', type: 'error' });
        return;
      }
      finalObs = finalObs ? `${finalObs}, Almacenero: ${almaceneroClean}` : `Almacenero: ${almaceneroClean}`;
    }

    setSubmitting(true);

    try {
      const activeUserEmail = user ? user.email : 'Usuario Sistema';
      const keyToSend = transactionKey.trim() || 'Automatico';

      const { data, error } = await supabase.rpc('registrar_movimiento', {
        p_producto_codigo: codeClean,
        p_fecha: fecha,
        p_tipo: tipo,
        p_cantidad: qtyClean,
        p_usuario: activeUserEmail,
        p_observaciones: finalObs,
        p_key: keyToSend
      });

      if (error) throw error;

      if (data && data.success === false) {
        setFormMsg({ text: data.error, type: 'error' });
        setSubmitting(false);
        return;
      }

      setFormMsg({ text: 'Movimiento registrado correctamente.', type: 'success' });
      fetchLedgerMovements();
      
      // Clear forms
      setCodigo('');
      setNombre('');
      setCantidad('');
      setObservaciones('');
      setAlmacenero('');
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

  // Helper to parse dates supporting Excel serial numbers and standard strings
  const parseDateValue = (val, defaultDate) => {
    if (val === undefined || val === null) return defaultDate;
    const strVal = String(val).trim();
    if (!strVal) return defaultDate;

    // 1. Excel serial number format: e.g. "45123"
    if (/^\d+(\.\d+)?$/.test(strVal)) {
      const num = parseFloat(strVal);
      // Excel date epoch: 1899-12-30
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    // 2. Parse manually if it is a common Spanish/standard format to avoid timezone shifts
    // Check format: YYYY-MM-DD or YYYY/MM/DD
    let match = strVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      const [_, y, m, d] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Check format: DD-MM-YYYY or DD/MM/YYYY
    match = strVal.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
      const [_, d, m, y] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 3. Fallback to standard JS Date parsing
    const parsed = new Date(strVal);
    if (!isNaN(parsed.getTime())) {
      if (!strVal.includes('T') && !strVal.includes(':')) {
        // Date only - use UTC values to prevent offset shifts
        const year = parsed.getUTCFullYear();
        const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
        const day = String(parsed.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } else {
        // Date and time - use local values
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    return defaultDate;
  };

  // Helper to match column headers using case-insensitive normalization to prevent duplicate mappings
  const mapHeaders = (headers, isIngreso) => {
    const normalize = (str) => {
      return String(str || '')
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, '');
    };

    const normHeaders = headers.map(normalize);
    const matchedIndices = new Set();

    const findMatch = (targets) => {
      // 1. Try exact matches first
      for (const t of targets) {
        const targetNorm = normalize(t);
        for (let i = 0; i < normHeaders.length; i++) {
          if (!matchedIndices.has(i) && normHeaders[i] === targetNorm) {
            matchedIndices.add(i);
            return i;
          }
        }
      }
      // 2. Try substring match (only if normalized target length >= 3)
      for (const t of targets) {
        const targetNorm = normalize(t);
        if (targetNorm.length < 3) continue;
        for (let i = 0; i < normHeaders.length; i++) {
          if (!matchedIndices.has(i) && normHeaders[i].includes(targetNorm)) {
            matchedIndices.add(i);
            return i;
          }
        }
      }
      return -1;
    };

    // Map fields. Match specific ID Producto first to prevent overlap with Producto
    const colCodigo = findMatch(['idproducto', 'codigoproducto', 'codigo', 'cod', 'idproduct', 'productcode']);
    const colKey = findMatch(['transactionkey', 'key', 'clave', 'transkey', 'transactionid']);
    
    let colFecha, colCantidad, colUM, colAlmacenero, colProducto;
    if (isIngreso) {
      colFecha = findMatch(['fecha', 'fecharecproyecto', 'fecharec', 'date', 'fecharecepcion']);
      colCantidad = findMatch(['cantrecepcionada', 'cantidadrecepcionada', 'cant', 'cantidad', 'qty', 'amount']);
      colUM = findMatch(['um', 'unidad', 'unit']);
      colProducto = findMatch(['producto', 'product', 'nombre', 'name']);
    } else {
      colFecha = findMatch(['fecha', 'date', 'fecharec', 'fecharecproyecto']);
      colCantidad = findMatch(['cantentregada', 'cantidadentregada', 'cant', 'cantidad', 'qty', 'amount']);
      colUM = findMatch(['um', 'unidad', 'unit']);
      colAlmacenero = findMatch(['codalmacenero', 'almacenero', 'keeper']);
      colProducto = findMatch(['producto', 'product', 'nombre', 'name']);
    }

    return { colKey, colCodigo, colProducto, colFecha, colCantidad, colUM, colAlmacenero };
  };

  // Excel & CSV Import handler for Ingresos
  const handleImportIngresos = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setCsvMsg({ text: 'Procesando archivo de ingresos...', type: 'info' });
    setLastImport(null); // Clear previous undo state

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
        const { colKey, colCodigo, colFecha, colCantidad, colUM } = mapHeaders(rawHeaders, true);

        if (colCodigo === -1 || colCantidad === -1 || colKey === -1) {
          setCsvMsg({ 
            text: 'Formato de archivo incorrecto. Debe contener al menos las columnas: "Transaction Key", "ID Producto", y "Cant. Recepcionada".', 
            type: 'error' 
          });
          event.target.value = '';
          return;
        }

        // Gather unique product codes and transaction keys from file for validation
        const codesInFile = Array.from(new Set(
          rows.slice(1)
            .map(r => r[colCodigo] ? String(r[colCodigo]).trim().toUpperCase() : '')
            .filter(Boolean)
        ));

        const keysInFile = Array.from(new Set(
          rows.slice(1)
            .map(r => r[colKey] ? String(r[colKey]).trim() : '')
            .filter(Boolean)
        ));

        // Fetch verification data using efficient IN filters, including product units
        const [resProductos, resMovimientos] = await Promise.all([
          supabase.from('v_productos_stock').select('codigo, unidad').in('codigo', codesInFile),
          supabase.from('movimientos').select('key').in('key', keysInFile)
        ]);

        if (resProductos.error) throw resProductos.error;
        if (resMovimientos.error) throw resMovimientos.error;
        
        const productUnitMap = new Map();
        resProductos.data?.forEach(p => {
          productUnitMap.set(p.codigo.trim().toUpperCase(), p.unidad?.trim().toUpperCase() || '');
        });

        const existingKeys = new Set(resMovimientos.data.filter(m => m.key).map(m => m.key.trim().toUpperCase()));
        const defaultDate = fecha || new Date().toISOString().slice(0, 10);

        const movementsToUpsert = [];
        let skippedInvalidProduct = 0;
        let skippedInvalidAmount = 0;
        let skippedInconsistentUnit = 0;
        let emptyCount = 0;
        let insertCount = 0;
        let updateCount = 0;
        const seenKeysInSheet = new Set();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const keyRaw = row[colKey];
          const codigoRaw = row[colCodigo];
          const cantidadRaw = row[colCantidad];

          if (keyRaw === undefined || keyRaw === null || codigoRaw === undefined || codigoRaw === null || cantidadRaw === undefined || cantidadRaw === null) {
            emptyCount++;
            continue;
          }

          const keyVal = String(keyRaw).trim();
          const codigoVal = String(codigoRaw).trim().toUpperCase();
          const cantidadVal = parseFloat(cantidadRaw);

          if (!keyVal || !codigoVal || isNaN(cantidadVal)) {
            emptyCount++;
            continue;
          }

          const upperKey = keyVal.toUpperCase();

          // Validation: Product existence
          if (!productUnitMap.has(codigoVal)) {
            skippedInvalidProduct++;
            continue;
          }

          // Validation: Unit consistency
          const umRaw = colUM !== -1 ? row[colUM] : null;
          const umVal = umRaw ? String(umRaw).trim().toUpperCase() : '';
          const baseUnit = productUnitMap.get(codigoVal);
          if (umVal && baseUnit && umVal !== baseUnit) {
            skippedInconsistentUnit++;
            continue;
          }

          // Validation: Duplicate keys within the same sheet
          if (seenKeysInSheet.has(upperKey)) {
            continue;
          }
          seenKeysInSheet.add(upperKey);

          // Validation: Valid amount
          if (cantidadVal <= 0) {
            skippedInvalidAmount++;
            continue;
          }

          // Date processing
          const rawFecha = colFecha !== -1 ? row[colFecha] : null;
          const fechaVal = parseDateValue(rawFecha, defaultDate);

          // Observations formatting
          let obsParts = [];
          if (umRaw && String(umRaw).trim()) {
            obsParts.push(`UM: ${String(umRaw).trim()}`);
          }
          const obsVal = obsParts.join(', ');

          const isUpdate = existingKeys.has(upperKey);
          if (isUpdate) {
            updateCount++;
          } else {
            insertCount++;
          }

          movementsToUpsert.push({
            producto_codigo: codigoVal,
            fecha: fechaVal,
            tipo: 'INGRESO',
            cantidad: cantidadVal,
            usuario: 'Usuario Sistema',
            observaciones: obsVal,
            key: keyVal
          });
        }

        if (movementsToUpsert.length === 0) {
          let msg = 'No se importó ningún movimiento de ingreso nuevo ni se actualizaron registros.';
          const skippedList = [];
          if (skippedInvalidProduct > 0) skippedList.push(`${skippedInvalidProduct} productos inexistentes`);
          if (skippedInvalidAmount > 0) skippedList.push(`${skippedInvalidAmount} cantidades inválidas`);
          if (skippedInconsistentUnit > 0) skippedList.push(`${skippedInconsistentUnit} unidades inconsistentes`);
          if (skippedList.length > 0) {
            msg += ` (Omitidos: ${skippedList.join(', ')}).`;
          }
          setCsvMsg({ text: msg, type: 'warning' });
          event.target.value = '';
          return;
        }

        // Show preview instead of immediately inserting (FUNC-3)
        const skippedList = [];
        if (skippedInvalidProduct > 0) skippedList.push(`${skippedInvalidProduct} productos inexistentes`);
        if (skippedInvalidAmount > 0) skippedList.push(`${skippedInvalidAmount} cantidades inválidas`);
        if (skippedInconsistentUnit > 0) skippedList.push(`${skippedInconsistentUnit} unidades inconsistentes`);

        setImportPreview({
          type: 'ingreso',
          data: movementsToUpsert,
          insertCount,
          updateCount,
          skippedInfo: skippedList.join(', '),
          inputRef: event.target
        });
        setCsvMsg({ text: '', type: '' });
      } catch (err) {
        console.error('Error importing movements Excel/CSV:', err);
        setCsvMsg({ text: 'Error al importar: ' + err.message, type: 'error' });
        event.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Excel & CSV Import handler for Salidas
  const handleImportSalidas = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setExcelMsg({ text: 'Procesando archivo de salidas...', type: 'info' });
    setLastImport(null); // Clear previous undo state

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
          setExcelMsg({ text: 'El archivo está vacío o no contiene suficientes filas.', type: 'error' });
          event.target.value = '';
          return;
        }

        const rawHeaders = rows[0];
        const { colKey, colCodigo, colFecha, colCantidad, colUM, colAlmacenero } = mapHeaders(rawHeaders, false);

        if (colCodigo === -1 || colCantidad === -1 || colKey === -1) {
          setExcelMsg({ 
            text: 'Formato de archivo incorrecto. Debe contener al menos las columnas: "Transaction Key", "ID Producto", y "Cant. Entregada".', 
            type: 'error' 
          });
          event.target.value = '';
          return;
        }

        // Gather unique product codes and transaction keys from file for validation
        const codesInFile = Array.from(new Set(
          rows.slice(1)
            .map(r => r[colCodigo] ? String(r[colCodigo]).trim().toUpperCase() : '')
            .filter(Boolean)
        ));

        const keysInFile = Array.from(new Set(
          rows.slice(1)
            .map(r => r[colKey] ? String(r[colKey]).trim() : '')
            .filter(Boolean)
        ));

        // Fetch existing products, stock, units, and transaction keys
        const [resProductos, resMovimientos] = await Promise.all([
          supabase.from('v_productos_stock').select('codigo, unidad, cantidad').in('codigo', codesInFile),
          supabase.from('movimientos').select('key').in('key', keysInFile)
        ]);

        if (resProductos.error) throw resProductos.error;
        if (resMovimientos.error) throw resMovimientos.error;
        
        // Map codes to stock and units
        const productDataMap = new Map();
        resProductos.data.forEach(p => {
          productDataMap.set(p.codigo.trim().toUpperCase(), {
            stock: parseFloat(p.cantidad) || 0,
            unit: p.unidad?.trim().toUpperCase() || ''
          });
        });

        const existingKeys = new Set(resMovimientos.data.filter(m => m.key).map(m => m.key.trim().toUpperCase()));
        const defaultDate = fecha || new Date().toISOString().slice(0, 10);

        const movementsToInsert = [];
        let skippedInvalidProduct = 0;
        let skippedInvalidAmount = 0;
        let skippedDuplicateKey = 0;
        let skippedInsufficientStock = 0;
        let skippedInconsistentUnit = 0;
        let emptyCount = 0;
        const seenKeysInExcel = new Set();
        
        // Keep track of stock updates locally to prevent double-spending in the same sheet
        const localStockMap = new Map(resProductos.data.map(p => [p.codigo.trim().toUpperCase(), parseFloat(p.cantidad) || 0]));

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const keyRaw = row[colKey];
          const codigoRaw = row[colCodigo];
          const cantEntregadaRaw = row[colCantidad];

          if (keyRaw === undefined || keyRaw === null || codigoRaw === undefined || codigoRaw === null || cantEntregadaRaw === undefined || cantEntregadaRaw === null) {
            emptyCount++;
            continue;
          }

          const keyVal = String(keyRaw).trim();
          const codigoVal = String(codigoRaw).trim().toUpperCase();
          const cantEntregadaVal = parseFloat(cantEntregadaRaw);

          if (!keyVal || !codigoVal || isNaN(cantEntregadaVal)) {
            emptyCount++;
            continue;
          }

          const upperKey = keyVal.toUpperCase();

          // Validation: Product existence
          if (!productDataMap.has(codigoVal)) {
            skippedInvalidProduct++;
            continue;
          }

          const baseProduct = productDataMap.get(codigoVal);

          // Validation: Unit consistency
          const umRaw = colUM !== -1 ? row[colUM] : null;
          const umVal = umRaw ? String(umRaw).trim().toUpperCase() : '';
          if (umVal && baseProduct.unit && umVal !== baseProduct.unit) {
            skippedInconsistentUnit++;
            continue;
          }

          // Validation: Duplicate keys
          if (existingKeys.has(upperKey) || seenKeysInExcel.has(upperKey)) {
            skippedDuplicateKey++;
            continue;
          }
          seenKeysInExcel.add(upperKey);

          // Validation: Valid amount
          if (cantEntregadaVal <= 0) {
            skippedInvalidAmount++;
            continue;
          }

          // Validation: Insufficient stock
          const stockActual = localStockMap.get(codigoVal);
          if (stockActual < cantEntregadaVal) {
            skippedInsufficientStock++;
            continue;
          }

          // Update local stock map
          localStockMap.set(codigoVal, stockActual - cantEntregadaVal);

          // Date processing
          const rawFecha = colFecha !== -1 ? row[colFecha] : null;
          const fechaVal = parseDateValue(rawFecha, defaultDate);

          // Observations formatting
          const almaceneroRaw = colAlmacenero !== -1 ? row[colAlmacenero] : null;
          
          let obsParts = [];
          if (umRaw && String(umRaw).trim()) {
            obsParts.push(`UM: ${String(umRaw).trim()}`);
          }
          if (almaceneroRaw && String(almaceneroRaw).trim()) {
            obsParts.push(`Almacenero: ${String(almaceneroRaw).trim()}`);
          }
          const obsVal = obsParts.join(', ');

          movementsToInsert.push({
            producto_codigo: codigoVal,
            fecha: fechaVal,
            tipo: 'SALIDA',
            cantidad: cantEntregadaVal,
            usuario: 'Usuario Sistema',
            observaciones: obsVal,
            key: keyVal
          });
        }

        if (movementsToInsert.length === 0) {
          let msg = 'No se importó ningún movimiento de salida nuevo.';
          const skippedList = [];
          if (skippedInvalidProduct > 0) skippedList.push(`${skippedInvalidProduct} productos inexistentes`);
          if (skippedDuplicateKey > 0) skippedList.push(`${skippedDuplicateKey} claves duplicadas`);
          if (skippedInvalidAmount > 0) skippedList.push(`${skippedInvalidAmount} cantidades inválidas`);
          if (skippedInsufficientStock > 0) skippedList.push(`${skippedInsufficientStock} stock insuficiente`);
          if (skippedInconsistentUnit > 0) skippedList.push(`${skippedInconsistentUnit} unidades inconsistentes`);
          if (skippedList.length > 0) {
            msg += ` (Omitidos: ${skippedList.join(', ')}).`;
          }
          setExcelMsg({ text: msg, type: 'warning' });
          event.target.value = '';
          return;
        }

        // Show preview instead of immediately inserting (FUNC-3)
        const skippedList = [];
        if (skippedInvalidProduct > 0) skippedList.push(`${skippedInvalidProduct} productos inexistentes`);
        if (skippedDuplicateKey > 0) skippedList.push(`${skippedDuplicateKey} claves duplicadas`);
        if (skippedInvalidAmount > 0) skippedList.push(`${skippedInvalidAmount} cantidades inválidas`);
        if (skippedInsufficientStock > 0) skippedList.push(`${skippedInsufficientStock} stock insuficiente`);
        if (skippedInconsistentUnit > 0) skippedList.push(`${skippedInconsistentUnit} unidades inconsistentes`);

        setImportPreview({
          type: 'salida',
          data: movementsToInsert,
          insertCount: movementsToInsert.length,
          updateCount: 0,
          skippedInfo: skippedList.join(', '),
          inputRef: event.target
        });
        setExcelMsg({ text: '', type: '' });
      } catch (err) {
        console.error('Error importing movements Excel/CSV:', err);
        setExcelMsg({ text: 'Error al importar: ' + err.message, type: 'error' });
        event.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
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

  // Handle confirmed import execution (FUNC-3)
  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImportExecuting(true);

    try {
      const keysToImport = importPreview.data.map(m => m.key);
      
      // Query existing records to build rollback snapshot
      const { data: existingRecords, error: fetchError } = await supabase
        .from('movimientos')
        .select('id, key, producto_codigo, fecha, tipo, cantidad, usuario, observaciones, created_at')
        .in('key', keysToImport);
        
      if (fetchError) throw fetchError;

      if (importPreview.type === 'ingreso') {
        const { error } = await supabase.from('movimientos').upsert(importPreview.data, { onConflict: 'key' });
        if (error) throw error;
        
        setLastImport({
          type: 'ingreso',
          keys: keysToImport,
          prevRecords: existingRecords || [],
          newKeys: keysToImport.filter(k => !existingRecords?.some(r => r.key.toUpperCase() === k.toUpperCase()))
        });

        setCsvMsg({
          text: `Importación exitosa: se registraron ${importPreview.insertCount} nuevos ingresos y se actualizaron ${importPreview.updateCount} existentes.`,
          type: 'success'
        });
        fetchLedgerMovements();
      } else {
        const { error } = await supabase.from('movimientos').insert(importPreview.data);
        if (error) throw error;

        setLastImport({
          type: 'salida',
          keys: keysToImport,
          prevRecords: existingRecords || [],
          newKeys: keysToImport.filter(k => !existingRecords?.some(r => r.key.toUpperCase() === k.toUpperCase()))
        });

        setExcelMsg({
          text: `Importación exitosa: se registraron ${importPreview.insertCount} movimientos de tipo SALIDA.`,
          type: 'success'
        });
        fetchLedgerMovements();
      }

      if (importPreview.inputRef) importPreview.inputRef.value = '';
      setImportPreview(null);
    } catch (err) {
      console.error('Error executing import:', err);
      const msgSetter = importPreview.type === 'ingreso' ? setCsvMsg : setExcelMsg;
      msgSetter({ text: 'Error al importar: ' + err.message, type: 'error' });
      setImportPreview(null);
    } finally {
      setImportExecuting(false);
    }
  };

  // Rollback the last imported batch
  const handleUndoLastImport = async () => {
    if (!lastImport) return;
    setUndoing(true);
    try {
      // 1. Delete all newly inserted records
      if (lastImport.newKeys.length > 0) {
        const { error: deleteError } = await supabase
          .from('movimientos')
          .delete()
          .in('key', lastImport.newKeys);
        if (deleteError) throw deleteError;
      }

      // 2. Restore previously existing records (re-upsert their original states)
      if (lastImport.prevRecords.length > 0) {
        const recordsToRestore = lastImport.prevRecords.map(r => ({
          id: r.id,
          producto_codigo: r.producto_codigo,
          fecha: r.fecha,
          tipo: r.tipo,
          cantidad: r.cantidad,
          usuario: r.usuario,
          observaciones: r.observaciones,
          key: r.key,
          created_at: r.created_at
        }));
        const { error: restoreError } = await supabase
          .from('movimientos')
          .upsert(recordsToRestore);
        if (restoreError) throw restoreError;
      }

      const importType = lastImport.type;
      setLastImport(null);
      
      if (importType === 'ingreso') {
        setCsvMsg({ text: 'Importación deshecha correctamente. Los cambios fueron revertidos.', type: 'success' });
      } else {
        setExcelMsg({ text: 'Importación deshecha correctamente. Los cambios fueron revertidos.', type: 'success' });
      }
      fetchLedgerMovements();
    } catch (err) {
      console.error('Error undoing import:', err);
      const msgSetter = lastImport.type === 'ingreso' ? setCsvMsg : setExcelMsg;
      msgSetter({ text: 'Error al deshacer la importación: ' + err.message, type: 'error' });
    } finally {
      setUndoing(false);
    }
  };

  const getAlmaceneroFromObs = (obs) => {
    if (!obs) return '';
    const match = obs.match(/Almacenero:\s*([^,]+)/i);
    return match ? match[1].trim() : '';
  };

  return (
    <div id="movimientos" className="tab-content active">
      <div className="card">
        <div className="card-header">
          <span>Nuevo Movimiento de Inventario</span>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {/* Row 1: All 6 main fields on the same row */}
              <div className="movement-form-row-1">
                <div className="form-group m-col-fecha">
                  <label htmlFor="fechaMov">Fecha de mov. *</label>
                  <input 
                    type="date" 
                    id="fechaMov" 
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required 
                  />
                </div>

                <div className="form-group autocomplete-container m-col-id">
                  <label htmlFor="codigoMov">ID Producto *</label>
                  <input 
                    type="text" 
                    id="codigoMov" 
                    placeholder="Escriba código..." 
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

                <div className="form-group autocomplete-container m-col-producto">
                  <label htmlFor="nombreMov">Producto</label>
                  <input 
                    type="text" 
                    id="nombreMov" 
                    placeholder="Escriba nombre..." 
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

                <div className="form-group m-col-key">
                  <label htmlFor="keyMov">Transaction Key (Clave)</label>
                  <input 
                    type="text" 
                    id="keyMov" 
                    placeholder="Auto-generada" 
                    value={transactionKey}
                    onChange={(e) => setTransactionKey(e.target.value)}
                  />
                </div>

                <div className="form-group m-col-cantidad">
                  <label htmlFor="cantMov">Cantidad *</label>
                  <input 
                    type="number" 
                    id="cantMov" 
                    min="0.01" 
                    step="0.01" 
                    placeholder="Cant." 
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    required 
                  />
                </div>

                <div className="form-group m-col-tipo">
                  <label htmlFor="tipoMov">Tipo de Movimiento *</label>
                  <select 
                    id="tipoMov" 
                    value={tipo}
                    onChange={(e) => {
                      setTipo(e.target.value);
                    }}
                    required
                  >
                    <option value="INGRESO">Ingreso</option>
                    <option value="SALIDA">Salida</option>
                    <option value="AJUSTE_POSITIVO">Ajuste Positivo</option>
                    <option value="AJUSTE_NEGATIVO">Ajuste Negativo</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Cod Almacenero (if SALIDA) and Observaciones */}
              <div className="movement-form-row-2">
                {tipo === 'SALIDA' ? (
                  <>
                    <div className="form-group m-col-almacenero">
                      <label htmlFor="almaceneroMov">Cód. Almacenero *</label>
                      <input 
                        type="text" 
                        id="almaceneroMov" 
                        placeholder="Ej. K045" 
                        value={almacenero}
                        onChange={(e) => setAlmacenero(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group m-col-observaciones">
                      <label htmlFor="obsMov">Observaciones</label>
                      <input 
                        type="text"
                        id="obsMov" 
                        placeholder="Observaciones opcionales" 
                        maxLength={1000}
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="form-group m-col-observaciones">
                    <label htmlFor="obsMov">Observaciones</label>
                    <input 
                      type="text"
                      id="obsMov" 
                      placeholder="Observaciones opcionales" 
                      maxLength={1000}
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="actions">
              <button type="submit" className="btn btn-success" disabled={submitting}>
                <Save size={16} />
                <span>Guardar Movimiento</span>
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => setShowImportModal(true)}
              >
                <Upload size={16} />
                <span>Importar desde Excel / CSV</span>
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setCodigo('');
                  setNombre('');
                  setCantidad('');
                  setObservaciones('');
                  setAlmacenero('');
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

      {showImportModal && !importPreview && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} style={{ color: 'var(--primary)' }} />
                <span>Importar desde Excel / CSV</span>
              </div>
              <button 
                onClick={() => {
                  setShowImportModal(false);
                  setImportOption(null);
                  setCsvMsg({ text: '', type: '' });
                  setExcelMsg({ text: '', type: '' });
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              
              {/* Option Selector Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <button
                  type="button"
                  className={`btn ${importOption === 'ingreso' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '12px' }}
                  onClick={() => {
                    setImportOption('ingreso');
                    setCsvMsg({ text: '', type: '' });
                    setExcelMsg({ text: '', type: '' });
                  }}
                >
                  Ingreso de material
                </button>
                <button
                  type="button"
                  className={`btn ${importOption === 'salida' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '12px' }}
                  onClick={() => {
                    setImportOption('salida');
                    setCsvMsg({ text: '', type: '' });
                    setExcelMsg({ text: '', type: '' });
                  }}
                >
                  Salida de Material
                </button>
              </div>

              {/* Instructions and File Selector based on selected option */}
              {importOption === 'ingreso' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    Seleccione un archivo Excel (.xlsx, .xls) o CSV (.csv) para registrar múltiples movimientos de tipo Ingreso en lote. El archivo debe incluir las cabeceras: <strong>Transaction Key</strong>, <strong>Fecha</strong>, <strong>ID Producto</strong>, <strong>Producto</strong>, <strong>Cant. Recepcionada</strong>, y <strong>Unidad</strong>.
                    <br /><br />
                    <strong>Nota importante:</strong> Los productos a importar ya deben existir en el sistema.
                  </p>
                  
                  <div className="actions" style={{ marginBottom: 0 }}>
                    <label className="btn btn-primary" style={{ cursor: 'pointer', padding: '12px' }}>
                      <Upload size={16} />
                      <span>Seleccionar archivo</span>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleImportIngresos} 
                        style={{ display: 'none' }} 
                      />
                    </label>
                  </div>

                  {csvMsg.text && (
                    <div className={`message ${csvMsg.type}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', margin: '12px 0 0 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {csvMsg.type === 'info' ? <Info size={16} /> : csvMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{csvMsg.text}</span>
                      </div>
                      {csvMsg.type === 'success' && lastImport && lastImport.type === 'ingreso' && (
                        <button 
                          onClick={handleUndoLastImport} 
                          disabled={undoing}
                          className="btn btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem', marginLeft: '12px' }}
                        >
                          {undoing ? 'Deshaciendo...' : 'Deshacer'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importOption === 'salida' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    Seleccione un archivo Excel (.xlsx, .xls) o CSV (.csv) para registrar múltiples movimientos de tipo Salida en lote. El archivo debe incluir las cabeceras: <strong>Transaction Key</strong>, <strong>Fecha</strong>, <strong>ID Producto</strong>, <strong>Producto</strong>, <strong>Cant. Entregada</strong>, <strong>Unidad</strong>, y <strong>Cód.Almacenero</strong>.
                    <br /><br />
                    <strong>Nota importante:</strong> El sistema verificará que exista stock suficiente para cada salida. De lo contrario, se omitirán esas filas.
                  </p>
                  
                  <div className="actions" style={{ marginBottom: 0 }}>
                    <label className="btn btn-primary" style={{ cursor: 'pointer', padding: '12px' }}>
                      <Upload size={16} />
                      <span>Seleccionar archivo</span>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleImportSalidas} 
                        style={{ display: 'none' }} 
                      />
                    </label>
                  </div>

                  {excelMsg.text && (
                    <div className={`message ${excelMsg.type}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', margin: '12px 0 0 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {excelMsg.type === 'info' ? <Info size={16} /> : excelMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{excelMsg.text}</span>
                      </div>
                      {excelMsg.type === 'success' && lastImport && lastImport.type === 'salida' && (
                        <button 
                          onClick={handleUndoLastImport} 
                          disabled={undoing}
                          className="btn btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem', marginLeft: '12px' }}
                        >
                          {undoing ? 'Deshaciendo...' : 'Deshacer'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Default Message when no option is selected */}
              {!importOption && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0', fontSize: '0.9rem' }}>
                  Seleccione una opción para ver las instrucciones y cargar un archivo.
                </p>
              )}

            </div>
            
            <div style={{ padding: '16px 24px', background: 'var(--bg-card-header)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowImportModal(false);
                  setImportOption(null);
                  setCsvMsg({ text: '', type: '' });
                  setExcelMsg({ text: '', type: '' });
                }}
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Import Preview/Confirmation Modal (FUNC-3) */}
      {importPreview && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '700px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} style={{ color: 'var(--primary)' }} />
                <span>Vista Previa de Importación ({importPreview.type === 'ingreso' ? 'Ingresos' : 'Salidas'})</span>
              </div>
              <button
                onClick={() => { setImportPreview(null); if (importPreview.inputRef) importPreview.inputRef.value = ''; }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                disabled={importExecuting}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              {/* Summary */}
              <div className="message success" style={{ marginBottom: '16px' }}>
                <CheckCircle2 size={16} />
                <span>
                  <strong>{importPreview.data.length}</strong> registros listos para importar
                  {importPreview.updateCount > 0 && ` (${importPreview.insertCount} nuevos, ${importPreview.updateCount} actualizaciones)`}
                </span>
              </div>

              {importPreview.skippedInfo && (
                <div className="message warning" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} />
                  <span>Omitidos: {importPreview.skippedInfo}</span>
                </div>
              )}

              {/* Preview Table */}
              <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>ID Producto</th>
                      <th>Fecha</th>
                      <th>Cantidad</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.data.slice(0, 10).map((m, idx) => (
                      <tr key={idx}>
                        <td><small>{m.key}</small></td>
                        <td><strong>{m.producto_codigo}</strong></td>
                        <td>{m.fecha}</td>
                        <td>{m.cantidad}</td>
                        <td>{m.tipo}</td>
                      </tr>
                    ))}
                    {importPreview.data.length > 10 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          ... y {importPreview.data.length - 10} registros más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setImportPreview(null); if (importPreview.inputRef) importPreview.inputRef.value = ''; }}
                  disabled={importExecuting}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleConfirmImport}
                  disabled={importExecuting}
                >
                  <Upload size={16} />
                  <span>{importExecuting ? 'Importando...' : 'Confirmar Importación'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial y Administración de Movimientos */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={18} />
            <span>Historial y Administración de Movimientos</span>
          </div>
        </div>
        <div className="card-body">
          {/* Filters */}
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label htmlFor="ledgerDateFrom">Fecha Desde</label>
              <input 
                type="date" 
                id="ledgerDateFrom" 
                value={ledgerDateFrom} 
                onChange={(e) => setLedgerDateFrom(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label htmlFor="ledgerDateTo">Fecha Hasta</label>
              <input 
                type="date" 
                id="ledgerDateTo" 
                value={ledgerDateTo} 
                onChange={(e) => setLedgerDateTo(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label htmlFor="ledgerType">Filtrar por Tipo</label>
              <select 
                id="ledgerType" 
                value={ledgerType} 
                onChange={(e) => setLedgerType(e.target.value)}
              >
                <option value="">Todos los movimientos</option>
                <option value="INGRESO">Ingresos</option>
                <option value="SALIDA">Salidas</option>
                <option value="AJUSTE_POSITIVO">Ajustes Positivos</option>
                <option value="AJUSTE_NEGATIVO">Ajustes Negativos</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ledgerSearch">Buscar Producto / Código / Clave</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  id="ledgerSearch" 
                  placeholder="Buscar..." 
                  value={ledgerSearch} 
                  onChange={(e) => setLedgerSearch(e.target.value)} 
                />
                <button className="btn btn-primary" onClick={fetchLedgerMovements}>Buscar</button>
              </div>
            </div>
          </div>

          {ledgerMsg.text && (
            <div className={`message ${ledgerMsg.type}`} style={{ marginBottom: '16px' }}>
              {ledgerMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{ledgerMsg.text}</span>
            </div>
          )}

          {ledgerLoading ? (
            <div className="loading-container">
              <span className="spinner"></span>
              <span>Cargando movimientos...</span>
            </div>
          ) : ledgerError ? (
            <div className="message error">
              <AlertCircle size={16} />
              <span>{ledgerError}</span>
            </div>
          ) : ledgerMovements.length === 0 ? (
            <div className="message warning">
              <AlertCircle size={16} />
              <span>No se encontraron movimientos registrados.</span>
            </div>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>ID Producto</th>
                      <th>Producto</th>
                      <th>Unidad</th>
                      <th>Cantidad</th>
                      <th>Tipo</th>
                      <th>Transaction Key</th>
                      <th>Usuario</th>
                      <th>Almacenero</th>
                      <th style={{ width: '120px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(ledgerMovements.length / ledgerRowsPerPage));
                      const safePage = Math.min(ledgerPage, totalPages);
                      const startIdx = (safePage - 1) * ledgerRowsPerPage;
                      const pageData = ledgerMovements.slice(startIdx, startIdx + ledgerRowsPerPage);
                      return pageData.map((m) => {
                        let tipoClass = 'text-success';
                        let tipoText = m.tipo;
                        switch (m.tipo) {
                          case 'INGRESO':
                            tipoClass = 'text-success';
                            tipoText = 'Ingreso';
                            break;
                          case 'SALIDA':
                            tipoClass = 'text-danger';
                            tipoText = 'Salida';
                            break;
                          case 'AJUSTE_POSITIVO':
                            tipoClass = 'text-success';
                            tipoText = 'Ajuste +';
                            break;
                          case 'AJUSTE_NEGATIVO':
                            tipoClass = 'text-danger';
                            tipoText = 'Ajuste -';
                            break;
                          default:
                            tipoClass = 'text-info';
                        }

                        return (
                          <tr key={m.id}>
                            <td>{m.fecha}</td>
                            <td><strong>{m.codigo}</strong></td>
                            <td>{m.producto}</td>
                            <td>{m.unidad}</td>
                            <td>{m.cantidad}</td>
                            <td className={tipoClass}><strong>{tipoText}</strong></td>
                            <td><small>{m.key}</small></td>
                            <td><small>{m.usuario}</small></td>
                            <td>{m.tipo === 'SALIDA' ? (getAlmaceneroFromObs(m.observaciones) || '-') : '-'}</td>
                            <td style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }} 
                                onClick={() => handleEditClick(m)}
                              >
                                Editar
                              </button>
                              <button 
                                className="btn btn-danger" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }} 
                                onClick={() => handleDeleteClick(m)}
                              >
                                Borrar
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {(() => {
                const totalPages = Math.max(1, Math.ceil(ledgerMovements.length / ledgerRowsPerPage));
                const safePage = Math.min(ledgerPage, totalPages);
                const startIdx = (safePage - 1) * ledgerRowsPerPage;
                if (totalPages <= 1) return null;
                return (
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
                      <span>Mostrando {startIdx + 1}–{Math.min(startIdx + ledgerRowsPerPage, ledgerMovements.length)} de {ledgerMovements.length}</span>
                      <select 
                        value={ledgerRowsPerPage} 
                        onChange={(e) => { setLedgerRowsPerPage(Number(e.target.value)); setLedgerPage(1); }}
                        style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto' }}
                      >
                        <option value={10}>10 filas</option>
                        <option value={25}>25 filas</option>
                        <option value={50}>50 filas</option>
                        <option value={100}>100 filas</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setLedgerPage(1)} disabled={safePage === 1}>«</button>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setLedgerPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
                      <span style={{ padding: '4px 12px', fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>{safePage} / {totalPages}</span>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setLedgerPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</button>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setLedgerPage(totalPages)} disabled={safePage === totalPages}>»</button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Edit Movement Modal */}
      {showEditModal && actionTarget && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '450px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✏️ Editar Cantidad de Movimiento</span>
              <button 
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                disabled={actionLoading}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Modificando el movimiento de <strong>{actionTarget.tipo}</strong> para el producto <strong>{actionTarget.codigo}</strong>.
              </p>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="editQtyInput">Nueva Cantidad *</label>
                <input 
                  type="number" 
                  id="editQtyInput"
                  min="0.01"
                  step="0.01"
                  value={actionQty}
                  onChange={(e) => setActionQty(e.target.value)}
                  disabled={actionLoading}
                />
              </div>

              {!adminDni && (
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="editDniInput">DNI de Administrador para Autorizar *</label>
                  <input 
                    type="text" 
                    id="editDniInput"
                    placeholder="Ingrese su DNI"
                    value={actionDni}
                    onChange={(e) => setActionDni(e.target.value)}
                    maxLength={20}
                    disabled={actionLoading}
                  />
                </div>
              )}

              {actionError && (
                <div className="message error" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} />
                  <span>{actionError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowEditModal(false)}
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleConfirmEdit}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Movement Modal */}
      {showDeleteModal && actionTarget && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '450px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--danger-text)' }}>
              <span>⚠️ Confirmar Eliminación de Movimiento</span>
              <button 
                onClick={() => setShowDeleteModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                disabled={actionLoading}
              >
                <X size={20} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', lineHeight: '1.5', fontSize: '0.9rem' }}>
                ¿Está seguro de que desea eliminar permanentemente este registro de movimiento?
                <br /><br />
                <strong>Detalles:</strong>
                <br />
                • Producto: <strong>{actionTarget.codigo}</strong> - {actionTarget.producto}
                <br />
                • Tipo: {actionTarget.tipo} | Cantidad: {actionTarget.cantidad}
                <br />
                • Clave: {actionTarget.key}
              </p>

              {!adminDni && (
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="deleteDniInput">DNI de Administrador para Autorizar *</label>
                  <input 
                    type="text" 
                    id="deleteDniInput"
                    placeholder="Ingrese su DNI"
                    value={actionDni}
                    onChange={(e) => setActionDni(e.target.value)}
                    maxLength={20}
                    disabled={actionLoading}
                  />
                </div>
              )}

              {actionError && (
                <div className="message error" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} />
                  <span>{actionError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowDeleteModal(false)}
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={handleConfirmDelete}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Eliminando...' : 'Confirmar Eliminación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
