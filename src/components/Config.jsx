import React, { useState, useRef } from 'react';
import { supabase } from '../supabase';
import { createClient } from '@supabase/supabase-js';
import { Settings, ShieldAlert, CheckCircle2, AlertCircle, X, HelpCircle, UserPlus, Shield, Mail, KeyRound, Trash2, ShieldCheck, User, UserMinus, Download, Database, Pencil, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Config({ user }) {
  const [resultMsg, setResultMsg] = useState({ text: '', type: '' });
  const [loadingAction, setLoadingAction] = useState(false);

  // Reset modal states
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: DNI entry, 2: Final confirmation, 3: Success
  const [dni, setDni] = useState('');
  const [dniError, setDniError] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  // User creation states
  const [userAdminDni, setUserAdminDni] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [newAdminDni, setNewAdminDni] = useState('');
  const [newAdminNombre, setNewAdminNombre] = useState('');
  const [userMsg, setUserMsg] = useState({ text: '', type: '' });
  const [creatingUser, setCreatingUser] = useState(false);

  // New user management states
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [promotingUser, setPromotingUser] = useState(null);
  const [promoDni, setPromoDni] = useState('');
  const [promoNombre, setPromoNombre] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promotingAction, setPromotingAction] = useState(false);

  // Audit log states
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Backup states
  const [backupsList, setBackupsList] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Dynamic Filters for Smart Import Wizard
  const [almaceneros, setAlmaceneros] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [newAlmaceneroCodigo, setNewAlmaceneroCodigo] = useState('');
  const [newAlmaceneroNombre, setNewAlmaceneroNombre] = useState('');
  const [newDisciplinaNombre, setNewDisciplinaNombre] = useState('');

  // Editing and custom deletion states for dynamic filters
  const [editingAlmacenero, setEditingAlmacenero] = useState(null); // { codigo, nombre }
  const [editAlmaceneroCodigo, setEditAlmaceneroCodigo] = useState('');
  const [editAlmaceneroNombre, setEditAlmaceneroNombre] = useState('');
  const [savingAlmacenero, setSavingAlmacenero] = useState(false);
  const [deletingAlmacenero, setDeletingAlmacenero] = useState(null); // { codigo, nombre }

  const [editingDisciplina, setEditingDisciplina] = useState(null); // { nombre }
  const [editDisciplinaNombre, setEditDisciplinaNombre] = useState('');
  const [savingDisciplina, setSavingDisciplina] = useState(false);
  const [deletingDisciplina, setDeletingDisciplina] = useState(null); // { nombre }
  
  const [filterActionError, setFilterActionError] = useState('');

  // User management auto-unlock states
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // ── Equivalences / Synonym Dictionary States ──
  const [synonymsList, setSynonymsList] = useState([]);
  const [synPage, setSynPage] = useState(1);
  const [synTotalCount, setSynTotalCount] = useState(0);
  const [synLoading, setSynLoading] = useState(false);
  const [synSearch, setSynSearch] = useState('');
  const [synTypeFilter, setSynTypeFilter] = useState('ALL');
  
  // Add/Edit Form States
  const [synShowForm, setSynShowForm] = useState(false);
  const [synFormId, setSynFormId] = useState(null); // null when adding
  const [synFormText, setSynFormText] = useState('');
  const [synFormType, setSynFormType] = useState('DESCRIPCION');
  const [synFormProductSearch, setSynFormProductSearch] = useState('');
  const [synFormProductSuggestions, setSynFormProductSuggestions] = useState([]);
  const [synFormSelectedProduct, setSynFormSelectedProduct] = useState(null); // { codigo, nombre }
  const [synFormMsg, setSynFormMsg] = useState({ text: '', type: '' });
  const [synFormSaving, setSynFormSaving] = useState(false);

  const autocompleteTimeoutSyn = useRef(null);
  const SYN_ROWS_PER_PAGE = 10;

  const fetchSynonyms = async () => {
    setSynLoading(true);
    try {
      let query = supabase
        .from('productos_sinonimos')
        .select(`
          id,
          producto_codigo,
          texto_sinonimo,
          tipo_columna,
          created_at,
          producto:productos(nombre)
        `, { count: 'exact' });

      if (synTypeFilter !== 'ALL') {
        query = query.eq('tipo_columna', synTypeFilter);
      }

      if (synSearch.trim()) {
        const term = `%${synSearch.trim()}%`;
        query = query.or(`texto_sinonimo.ilike.${term},producto_codigo.ilike.${term}`);
      }

      query = query.order('created_at', { ascending: false });

      const from = (synPage - 1) * SYN_ROWS_PER_PAGE;
      const to = from + SYN_ROWS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setSynonymsList(data || []);
      setSynTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching synonyms dictionary:', err);
    } finally {
      setSynLoading(false);
    }
  };

  const handleUploadEquivalenciasExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
          alert('El archivo Excel está vacío.');
          return;
        }

        const sampleRow = rows[0];
        let keyProductCode = null;
        let equivColKey = null;
        let descColKey = null;
        let txtLargoColKey = null;
        let txtPosColKey = null;

        const productKeys = ['id producto', 'producto_codigo', 'codigo', 'código', 'id_producto'];

        for (const k of Object.keys(sampleRow)) {
          const kl = k.toLowerCase().trim();
          if (productKeys.includes(kl)) {
            keyProductCode = k;
          } else if (/equiv|equivalencia|sinonimo|sinónimo|texto_sinonimo/i.test(kl)) {
            equivColKey = k;
          } else if (/descripcion|descripción/i.test(kl)) {
            descColKey = k;
          } else if (/txt.*largo|texto.*largo|largo/i.test(kl)) {
            txtLargoColKey = k;
          } else if (/txt.*pos|texto.*pos|posicion|posición/i.test(kl)) {
            txtPosColKey = k;
          }
        }

        const synonymColumns = [];
        if (equivColKey) {
          synonymColumns.push({ key: equivColKey, type: 'DESCRIPCION' });
        } else if (descColKey) {
          synonymColumns.push({ key: descColKey, type: 'DESCRIPCION' });
        }

        if (txtLargoColKey) {
          synonymColumns.push({ key: txtLargoColKey, type: 'TXT_LARGO' });
        }
        if (txtPosColKey) {
          synonymColumns.push({ key: txtPosColKey, type: 'TXT_POS' });
        }

        if (!keyProductCode) {
          alert('No se encontró la columna de Código de Producto (ej: "ID Producto").');
          return;
        }

        if (synonymColumns.length === 0) {
          alert('No se encontraron columnas de equivalencias (ej: "EQUIV", "TXT_LARGO", o "TXT_POS").');
          return;
        }

        const recordsToInsert = [];
        const invalidCodes = [];
        const uniqueKeysSet = new Set();
        
        const { data: allProducts, error: prodErr } = await supabase.from('productos').select('codigo');
        if (prodErr) throw prodErr;
        const existingCodesSet = new Set((allProducts || []).map(p => String(p.codigo).toLowerCase()));

        for (const row of rows) {
          const rawCode = row[keyProductCode];
          if (!rawCode) continue;

          const cleanCode = String(rawCode).trim();
          if (!cleanCode) continue;

          if (!existingCodesSet.has(cleanCode.toLowerCase())) {
            invalidCodes.push(cleanCode);
            continue;
          }

          // Process each synonym column detected in this row
          for (const synCol of synonymColumns) {
            const rawEquiv = row[synCol.key];
            if (rawEquiv) {
              const cleanEquiv = String(rawEquiv).trim();
              if (cleanEquiv) {
                const uniqueKey = `${cleanEquiv.toLowerCase()}|${synCol.type}`;
                if (!uniqueKeysSet.has(uniqueKey)) {
                  uniqueKeysSet.add(uniqueKey);
                  recordsToInsert.push({
                    producto_codigo: cleanCode,
                    texto_sinonimo: cleanEquiv,
                    tipo_columna: synCol.type
                  });
                }
              }
            }
          }
        }

        if (recordsToInsert.length === 0) {
          alert('No se encontraron registros válidos para importar. Asegúrese de que los códigos de producto ya existan en el sistema.');
          return;
        }

        const { error: upsertErr } = await supabase
          .from('productos_sinonimos')
          .upsert(recordsToInsert, { onConflict: 'texto_sinonimo,tipo_columna' });

        if (upsertErr) throw upsertErr;

        let alertMsg = `Se importaron ${recordsToInsert.length} equivalencias con éxito.`;
        if (invalidCodes.length > 0) {
          const uniqueInvalid = Array.from(new Set(invalidCodes));
          alertMsg += `\n\nNota: ${uniqueInvalid.length} códigos de producto no se importaron porque no existen en el sistema (ej: ${uniqueInvalid.slice(0, 5).join(', ')}).`;
        }
        alert(alertMsg);
        fetchSynonyms();
      } catch (err) {
        console.error('Error importing equivalencias:', err);
        alert('Error al importar archivo Excel: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const fetchProductSuggestions = async (val) => {
    const cleanVal = val.trim();
    if (!cleanVal) {
      setSynFormProductSuggestions([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('v_productos_stock')
        .select('codigo, nombre')
        .or(`codigo.ilike.%${cleanVal}%,nombre.ilike.%${cleanVal}%`)
        .limit(8);

      if (error) throw error;
      setSynFormProductSuggestions(data || []);
    } catch (err) {
      console.error('Error fetching product suggestions:', err);
    }
  };

  const handleSynProductSearchChange = (val) => {
    setSynFormProductSearch(val);
    if (autocompleteTimeoutSyn.current) clearTimeout(autocompleteTimeoutSyn.current);

    autocompleteTimeoutSyn.current = setTimeout(() => {
      fetchProductSuggestions(val);
    }, 200);
  };

  const handleSaveSynonym = async (e) => {
    e.preventDefault();
    setSynFormMsg({ text: '', type: '' });

    if (!synFormText.trim()) {
      setSynFormMsg({ text: 'El texto del sinónimo es obligatorio.', type: 'error' });
      return;
    }

    if (!synFormSelectedProduct) {
      setSynFormMsg({ text: 'Debe seleccionar un producto válido de la base de datos.', type: 'error' });
      return;
    }

    setSynFormSaving(true);
    try {
      const payload = {
        producto_codigo: synFormSelectedProduct.codigo,
        texto_sinonimo: synFormText.trim(),
        tipo_columna: synFormType
      };

      if (synFormId) {
        const { error } = await supabase
          .from('productos_sinonimos')
          .update(payload)
          .eq('id', synFormId);

        if (error) throw error;
        setSynFormMsg({ text: 'Equivalencia actualizada correctamente.', type: 'success' });
      } else {
        const { error } = await supabase
          .from('productos_sinonimos')
          .insert(payload);

        if (error) throw error;
        setSynFormMsg({ text: 'Equivalencia creada correctamente.', type: 'success' });
      }

      fetchSynonyms();

      setTimeout(() => {
        setSynShowForm(false);
        setSynFormId(null);
        setSynFormText('');
        setSynFormType('DESCRIPCION');
        setSynFormProductSearch('');
        setSynFormProductSuggestions([]);
        setSynFormSelectedProduct(null);
        setSynFormMsg({ text: '', type: '' });
      }, 1500);

    } catch (err) {
      console.error('Error saving synonym:', err);
      let msg = err.message || 'Error desconocido';
      if (msg.includes('unique') || msg.includes('violates unique constraint')) {
        msg = `Ya existe la equivalencia "${synFormText.trim()}" para la columna ${synFormType}.`;
      }
      setSynFormMsg({ text: 'Error al guardar: ' + msg, type: 'error' });
    } finally {
      setSynFormSaving(false);
    }
  };

  const handleDeleteSynonym = async (id, text) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la equivalencia "${text}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('productos_sinonimos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchSynonyms();
    } catch (err) {
      console.error('Error deleting synonym:', err);
      alert('Error al eliminar equivalencia: ' + err.message);
    }
  };

  const handleEditSynonymClick = (syn) => {
    setSynFormId(syn.id);
    setSynFormText(syn.texto_sinonimo);
    setSynFormType(syn.tipo_columna);
    setSynFormSelectedProduct({
      codigo: syn.producto_codigo,
      nombre: syn.producto ? syn.producto.nombre : 'Producto cargado'
    });
    setSynFormProductSearch(`${syn.producto_codigo} - ${syn.producto ? syn.producto.nombre : ''}`);
    setSynFormProductSuggestions([]);
    setSynFormMsg({ text: '', type: '' });
    setSynShowForm(true);
  };

  React.useEffect(() => {
    if (user) {
      fetchSynonyms();
      fetchDynamicFilters();
    }
  }, [synPage, synTypeFilter, user]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSynPage(1);
      if (user) {
        fetchSynonyms();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [synSearch]);
  // Validate integrity via server-side RPC
  const handleValidateIntegrity = async () => {
    setResultMsg({ text: '', type: '' });
    setLoadingAction(true);
    try {
      const { data, error } = await supabase.rpc('validar_integridad');
      if (error) throw error;

      if (data.is_healthy) {
        setResultMsg({
          text: 'Integridad verificada con éxito. No se encontraron inconsistencias en la base de datos.',
          type: 'success'
        });
      } else {
        const issues = [];
        if (data.orphaned_movements > 0) issues.push(`${data.orphaned_movements} movimientos huérfanos`);
        if (data.negative_stock > 0) issues.push(`${data.negative_stock} productos con stock negativo`);
        if (data.invalid_tipos > 0) issues.push(`${data.invalid_tipos} movimientos con tipo inválido`);
        setResultMsg({
          text: `Se detectaron inconsistencias: ${issues.join(', ')}.`,
          type: 'error'
        });
      }
    } catch (err) {
      console.error('Integrity validation error:', err);
      setResultMsg({
        text: 'Error al validar integridad: ' + err.message,
        type: 'error'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Check Supabase connection
  const handleCheckConnection = async () => {
    setResultMsg({ text: '', type: '' });
    setLoadingAction(true);
    try {
      const { error } = await supabase.from('unidades').select('count', { head: true });
      if (error) throw error;
      setResultMsg({
        text: 'Conexión a la base de datos Supabase establecida exitosamente. Las tablas del sistema responden correctamente.',
        type: 'success'
      });
    } catch (err) {
      console.error('Database check connection error:', err);
      setResultMsg({
        text: 'Error de conexión a la base de datos: ' + err.message,
        type: 'error'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Open reset confirmation wizard
  const handleOpenReset = () => {
    setDni('');
    setDniError('');
    setResetError('');
    setResetStep(1);
    setShowResetModal(true);
  };

  // Wizard Step navigation helpers
  const handleGoToStep2 = () => {
    setDniError('');
    const cleanDni = dni.trim();

    if (!cleanDni) {
      setDniError('El DNI es obligatorio.');
      return;
    }

    if (!/^\d+$/.test(cleanDni)) {
      setDniError('El DNI debe contener únicamente dígitos numéricos.');
      return;
    }

    if (cleanDni.length !== 8) {
      setDniError('El DNI debe tener exactamente 8 dígitos.');
      return;
    }

    setResetStep(2);
  };

  const handleExecuteReset = async () => {
    setResetError('');
    setResetting(true);

    try {
      const { error } = await supabase.rpc('reset_sistema_autorizado', {
        admin_dni: dni.trim()
      });

      if (error) throw error;

      setResetStep(3);
    } catch (err) {
      console.error('System reset error:', err);
      const errMsg = err.message || err.details || '';
      if (errMsg.includes('no está autorizado')) {
        setResultMsg({ text: 'DNI no autorizado.', type: 'error' });
        setShowResetModal(false);
      } else {
        setResetError('Error al restablecer la base de datos: ' + (errMsg || 'Error desconocido'));
      }
    } finally {
      setResetting(false);
    }
  };

  const fetchDynamicFilters = async () => {
    setLoadingFilters(true);
    try {
      const [resAlm, resDisc] = await Promise.all([
        supabase.from('almaceneros').select('*').order('codigo'),
        supabase.from('disciplinas').select('*').order('nombre')
      ]);
      if (resAlm.error) throw resAlm.error;
      if (resDisc.error) throw resDisc.error;
      setAlmaceneros(resAlm.data || []);
      setDisciplinas(resDisc.data || []);
    } catch (err) {
      console.error('Error fetching dynamic filters:', err);
    } finally {
      setLoadingFilters(false);
    }
  };

  const handleAddAlmacenero = async (e) => {
    e.preventDefault();
    if (!newAlmaceneroCodigo.trim() || !newAlmaceneroNombre.trim()) return;
    try {
      const { error } = await supabase.from('almaceneros').insert({
        codigo: newAlmaceneroCodigo.trim(),
        nombre: newAlmaceneroNombre.trim()
      });
      if (error) throw error;
      setNewAlmaceneroCodigo('');
      setNewAlmaceneroNombre('');
      fetchDynamicFilters();
    } catch (err) {
      alert('Error al agregar almacenero: ' + err.message);
    }
  };

  const handleEditAlmaceneroClick = (a) => {
    setEditingAlmacenero(a);
    setEditAlmaceneroCodigo(a.codigo);
    setEditAlmaceneroNombre(a.nombre);
    setFilterActionError('');
  };

  const handleConfirmEditAlmacenero = async (e) => {
    e.preventDefault();
    if (!editingAlmacenero || !editAlmaceneroCodigo.trim() || !editAlmaceneroNombre.trim()) return;
    setSavingAlmacenero(true);
    setFilterActionError('');
    try {
      const { error } = await supabase
        .from('almaceneros')
        .update({ 
          codigo: editAlmaceneroCodigo.trim(),
          nombre: editAlmaceneroNombre.trim()
        })
        .eq('codigo', editingAlmacenero.codigo);
      if (error) throw error;
      setEditingAlmacenero(null);
      fetchDynamicFilters();
    } catch (err) {
      console.error(err);
      setFilterActionError('Error al guardar: ' + err.message);
    } finally {
      setSavingAlmacenero(false);
    }
  };

  const handleEditDisciplinaClick = (d) => {
    setEditingDisciplina(d);
    setEditDisciplinaNombre(d.nombre);
    setFilterActionError('');
  };

  const handleConfirmEditDisciplina = async (e) => {
    e.preventDefault();
    if (!editingDisciplina || !editDisciplinaNombre.trim()) return;
    setSavingDisciplina(true);
    setFilterActionError('');
    try {
      const { error } = await supabase
        .from('disciplinas')
        .update({ nombre: editDisciplinaNombre.trim() })
        .eq('nombre', editingDisciplina.nombre);
      if (error) throw error;
      setEditingDisciplina(null);
      fetchDynamicFilters();
    } catch (err) {
      console.error(err);
      setFilterActionError('Error al guardar: ' + err.message);
    } finally {
      setSavingDisciplina(false);
    }
  };

  const handleDeleteAlmaceneroClick = (a) => {
    setDeletingAlmacenero(a);
    setFilterActionError('');
  };

  const handleConfirmDeleteAlmacenero = async () => {
    if (!deletingAlmacenero) return;
    setSavingAlmacenero(true);
    setFilterActionError('');
    try {
      const { error } = await supabase
        .from('almaceneros')
        .delete()
        .eq('codigo', deletingAlmacenero.codigo);
      if (error) throw error;
      setDeletingAlmacenero(null);
      fetchDynamicFilters();
    } catch (err) {
      console.error(err);
      setFilterActionError('Error al eliminar: ' + err.message);
    } finally {
      setSavingAlmacenero(false);
    }
  };

  const handleDeleteDisciplinaClick = (d) => {
    setDeletingDisciplina(d);
    setFilterActionError('');
  };

  const handleConfirmDeleteDisciplina = async () => {
    if (!deletingDisciplina) return;
    setSavingDisciplina(true);
    setFilterActionError('');
    try {
      const { error } = await supabase
        .from('disciplinas')
        .delete()
        .eq('nombre', deletingDisciplina.nombre);
      if (error) throw error;
      setDeletingDisciplina(null);
      fetchDynamicFilters();
    } catch (err) {
      console.error(err);
      setFilterActionError('Error al eliminar: ' + err.message);
    } finally {
      setSavingDisciplina(false);
    }
  };

  const handleAddDisciplina = async (e) => {
    e.preventDefault();
    if (!newDisciplinaNombre.trim()) return;
    try {
      const { error } = await supabase.from('disciplinas').insert({
        nombre: newDisciplinaNombre.trim()
      });
      if (error) throw error;
      setNewDisciplinaNombre('');
      fetchDynamicFilters();
    } catch (err) {
      alert('Error al agregar disciplina: ' + err.message);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const { data, error } = await supabase.rpc('obtener_logs_auditoria');
      if (error) throw error;
      setAuditLogs(data || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const renderAuditDetails = (log) => {
    const { operacion, datos_anteriores, datos_nuevos } = log;
    
    if (operacion === 'INSERT') {
      if (!datos_nuevos) return 'Datos no disponibles';
      const items = Object.entries(datos_nuevos)
        .filter(([_, v]) => v !== null && v !== '')
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
      return `Registrado: { ${items.join(', ')} }`;
    }
    
    if (operacion === 'DELETE') {
      if (!datos_anteriores) return 'Datos no disponibles';
      const items = Object.entries(datos_anteriores)
        .filter(([_, v]) => v !== null && v !== '')
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
      return `Eliminado: { ${items.join(', ')} }`;
    }
    
    if (operacion === 'UPDATE') {
      if (!datos_anteriores || !datos_nuevos) return 'Modificación general';
      const changes = [];
      for (const key in datos_nuevos) {
        const oldVal = datos_anteriores[key];
        const newVal = datos_nuevos[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          const oldStr = oldVal === null ? 'NULL' : typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal);
          const newStr = newVal === null ? 'NULL' : typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal);
          changes.push(`${key}: "${oldStr}" ➔ "${newStr}"`);
        }
      }
      return changes.length > 0 ? `Modificado: ${changes.join(' | ')}` : 'Sin cambios detectables';
    }
    
    return 'Acción desconocida';
  };

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const { data, error } = await supabase.rpc('listar_respaldos_seguridad', { p_email: user?.email });
      if (error) throw error;
      setBackupsList(data || []);
    } catch (err) {
      console.error('Error fetching backups list:', err);
      alert('Error al listar respaldos: ' + err.message);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleManualBackup = async () => {
    setCreatingBackup(true);
    try {
      const creatorName = `Manual (${user?.email || 'Admin'})`;
      const { error } = await supabase.rpc('crear_respaldo_seguridad', { p_creado_por: creatorName });
      if (error) throw error;
      fetchBackups();
    } catch (err) {
      console.error('Error generating manual backup:', err);
      alert('Error al generar respaldo: ' + err.message);
    } finally {
      setCreatingBackup(false);
    }
  };

  const downloadBackupAsExcel = async (backupId, backupFecha) => {
    try {
      const { data, error } = await supabase.rpc('obtener_respaldo_seguridad_detalle', {
        p_email: user?.email,
        p_respaldo_id: backupId
      });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No se encontró el respaldo.');

      const backupObj = data[0];
      const prods = backupObj.productos_snapshot || [];
      const movs = backupObj.movimientos_snapshot || [];

      // Format Products Sheet Data
      const formattedProds = prods.map(p => ({
        'Código': p.codigo,
        'Nombre': p.nombre,
        'Stock Actual': p.cantidad,
        'Unidad': p.unidad,
        'Grupo': p.grupo,
        'Stock Mínimo': p.stock_min,
        'F. Registro': p.created_at
      }));

      // Format Movements Sheet Data, sorting by date descending
      const sortedMovs = [...movs].sort((a, b) => {
        const dateA = new Date(a.fecha).getTime();
        const dateB = new Date(b.fecha).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

      const formattedMovs = sortedMovs.map(m => {
        const prod = prods.find(p => p.codigo === m.producto_codigo);
        // Ensure date is DD/MM/YYYY to match report, handling potential timestamp strings
        const rawDate = m.fecha ? m.fecha.split('T')[0] : '';
        const formattedDate = rawDate ? rawDate.split('-').reverse().join('/') : '';
        
        return {
          'Transaction Key': m.key || '',
          'Fecha': formattedDate,
          'ID Producto': m.producto_codigo,
          'Producto': prod ? prod.nombre : 'Producto no encontrado',
          'Cantidad': parseFloat(m.cantidad) || 0,
          'Unidad': prod ? prod.unidad : '',
          'Tipo': m.tipo,
          'Observaciones': m.observaciones || '',
          'Usuario': m.usuario
        };
      });

      const workbook = XLSX.utils.book_new();

      // Products Sheet
      const wsProds = XLSX.utils.json_to_sheet(formattedProds);
      const maxLensProds = {};
      formattedProds.forEach(row => {
        Object.entries(row).forEach(([col, val]) => {
          maxLensProds[col] = Math.max(maxLensProds[col] || 0, String(col).length, String(val ?? '').length);
        });
      });
      wsProds['!cols'] = Object.keys(maxLensProds).map(col => ({ wch: maxLensProds[col] + 3 }));
      XLSX.utils.book_append_sheet(workbook, wsProds, 'Productos Snapshot');

      // Movements Sheet
      const wsMovs = XLSX.utils.json_to_sheet(formattedMovs);
      const maxLensMovs = {};
      formattedMovs.forEach(row => {
        Object.entries(row).forEach(([col, val]) => {
          maxLensMovs[col] = Math.max(maxLensMovs[col] || 0, String(col).length, String(val ?? '').length);
        });
      });
      wsMovs['!cols'] = Object.keys(maxLensMovs).map(col => ({ wch: maxLensMovs[col] + 3 }));
      XLSX.utils.book_append_sheet(workbook, wsMovs, 'Movimientos Snapshot');

      const dateStr = new Date(backupFecha).toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Respaldo_Seguridad_${dateStr}.xlsx`);
    } catch (err) {
      console.error('Error downloading backup:', err);
      alert('Error al descargar el respaldo: ' + err.message);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase.rpc('listar_usuarios_sistema');
      if (error) throw error;
      setUsersList(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handlePromoteSubmit = async (e) => {
    e.preventDefault();
    setPromoError('');
    setPromotingAction(true);

    const dniVal = promoDni.trim();
    const nombreVal = promoNombre.trim();

    if (!dniVal || dniVal.length !== 8 || !/^\d+$/.test(dniVal)) {
      setPromoError('El DNI debe tener exactamente 8 dígitos.');
      setPromotingAction(false);
      return;
    }

    if (!nombreVal) {
      setPromoError('El nombre es obligatorio.');
      setPromotingAction(false);
      return;
    }

    try {
      const { error } = await supabase.rpc('asignar_administrador', {
        p_user_email: promotingUser.email,
        p_dni: dniVal,
        p_nombre: nombreVal
      });

      if (error) throw error;

      setPromotingUser(null);
      setPromoDni('');
      setPromoNombre('');
      fetchUsers();
    } catch (err) {
      console.error('Error promoting user:', err);
      setPromoError('Error al asignar administrador: ' + err.message);
    } finally {
      setPromotingAction(false);
    }
  };

  const handleDemoteUser = async (adminDni, adminEmail) => {
    if (adminEmail.toLowerCase() === user?.email?.toLowerCase()) {
      alert('No puedes quitarte los privilegios de administrador a ti mismo.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea quitar los privilegios de administrador a ${adminEmail}?`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('revocar_administrador', {
        p_dni: adminDni
      });

      if (error) throw error;
      fetchUsers();
    } catch (err) {
      console.error('Error demoting user:', err);
      alert('Error al quitar privilegios: ' + err.message);
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (email.toLowerCase() === user?.email?.toLowerCase()) {
      alert('No puedes eliminar tu propia cuenta.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar permanentemente al usuario ${email}? Esta acción es irreversible.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('eliminar_usuario_sistema', {
        p_user_id: userId
      });

      if (error) throw error;
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Error al eliminar usuario: ' + err.message);
    }
  };

  // Effect to automatically verify if the logged-in user is an administrator
  React.useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user || !user.email) {
        setIsAdminUser(false);
        setCheckingAdmin(false);
        return;
      }

      try {
        const { data: adminDni, error } = await supabase.rpc('obtener_dni_administrador', { p_email: user.email });
        if (error) throw error;

        if (adminDni) {
          setIsAdminUser(true);
          setUserAdminDni(adminDni);
          checkAdminRole();
          fetchUsers();
          fetchAuditLogs();
          fetchBackups();
        } else {
          setIsAdminUser(false);
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdminUser(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    checkAdminStatus();
  }, [user]);

  // Create user account from Web
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserMsg({ text: '', type: '' });
    setCreatingUser(true);

    const authorizingDni = userAdminDni.trim();
    const email = newUserEmail.trim();
    const password = newUserPassword;
    const adminDniVal = newAdminDni.trim();
    const adminNombreVal = newAdminNombre.trim();

    if (!authorizingDni) {
      setUserMsg({ text: 'Debe ingresar su DNI de administrador para autorizar.', type: 'error' });
      setCreatingUser(false);
      return;
    }

    if (!email || !password) {
      setUserMsg({ text: 'El correo y la contraseña son obligatorios.', type: 'error' });
      setCreatingUser(false);
      return;
    }

    if (makeAdmin && (!adminDniVal || !adminNombreVal)) {
      setUserMsg({ text: 'Si el usuario es administrador, debe ingresar el DNI y el nombre del nuevo administrador.', type: 'error' });
      setCreatingUser(false);
      return;
    }

    try {
      // 1. Validate authorizing DNI using RPC 'es_administrador'
      const { data: isAdmin, error: adminErr } = await supabase.rpc('es_administrador', { p_dni: authorizingDni });
      if (adminErr) throw adminErr;
      if (!isAdmin) {
        setUserMsg({ text: 'El DNI ingresado no tiene permisos de administrador para autorizar.', type: 'error' });
        setCreatingUser(false);
        return;
      }

      // 2. Create a temporary client to sign up the new user without breaking the current session
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Las credenciales de Supabase no están configuradas.');
      }

      const tempClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { error: signUpError } = await tempClient.auth.signUp({
        email,
        password
      });

      if (signUpError) throw signUpError;

      // 3. If "makeAdmin" is checked, insert the new admin in the DB via RPC 'crear_administrador_autorizado'
      if (makeAdmin) {
        const { error: makeAdminError } = await supabase.rpc('crear_administrador_autorizado', {
          p_admin_dni_autorizador: authorizingDni,
          p_nuevo_dni: adminDniVal,
          p_nuevo_nombre: adminNombreVal,
          p_nuevo_email: email
        });
        if (makeAdminError) throw makeAdminError;
      }

      setUserMsg({
        text: `Usuario ${email} registrado con éxito.${makeAdmin ? ' Registrado como administrador.' : ''}`,
        type: 'success'
      });

      // Refresh list
      fetchUsers();
      setShowCreateForm(false); // Auto-close form to show list

      // Clear fields
      setNewUserEmail('');
      setNewUserPassword('');
      setMakeAdmin(false);
      setNewAdminDni('');
      setNewAdminNombre('');
    } catch (err) {
      console.error('Error creating user:', err);
      setUserMsg({
        text: 'Error al registrar usuario: ' + (err.message || 'Error desconocido'),
        type: 'error'
      });
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div id="configuracion" className="tab-content active">
      <style>{`
        .row-actions-hover {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          background: #ffffff;
          padding-left: 8px;
          display: flex;
          gap: 6px;
        }
        .dark-theme .row-actions-hover {
          background: #121212;
        }
        tr:hover .row-actions-hover {
          opacity: 1;
          pointer-events: auto;
        }
        @media (max-width: 768px) {
          .row-actions-hover {
            position: static;
            transform: none;
            opacity: 1 !important;
            pointer-events: auto;
            margin-top: 6px;
            background: transparent !important;
            padding-left: 0;
          }
        }
      `}</style>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={18} />
            <span>Herramientas de Administración del Sistema</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Realice pruebas de diagnóstico o restablezca la base de datos de inventario. Estas acciones afectan directamente las tablas de Supabase.
          </p>

          <div className="actions">
            <button 
              className="btn btn-primary" 
              onClick={handleValidateIntegrity}
              disabled={loadingAction}
            >
              <span>Validar Integridad</span>
            </button>
            <button 
              className="btn btn-success" 
              onClick={handleCheckConnection}
              disabled={loadingAction}
            >
              <span>Prueba de Conexión</span>
            </button>
            <button 
              className="btn btn-danger" 
              onClick={handleOpenReset}
              disabled={loadingAction}
            >
              <ShieldAlert size={16} />
              <span>Restablecer Sistema</span>
            </button>
          </div>

          {resultMsg.text && (
            <div className={`message ${resultMsg.type}`} style={{ marginTop: '20px' }}>
              {resultMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{resultMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* Synonym/Equivalences Dictionary Card */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={18} />
            <span>Diccionario de Equivalencias (Tabla EQUIV)</span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn btn-success" 
              style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => document.getElementById('excelEquivInput').click()}
            >
              <Upload size={14} />
              <span>Importar de Excel</span>
            </button>
            <input 
              type="file" 
              id="excelEquivInput" 
              accept=".xlsx, .xls, .xlsb" 
              style={{ display: 'none' }}
              onChange={handleUploadEquivalenciasExcel}
            />
            <button 
              className="btn btn-primary" 
              style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                setSynFormId(null);
                setSynFormText('');
                setSynFormType('DESCRIPCION');
                setSynFormProductSearch('');
                setSynFormProductSuggestions([]);
                setSynFormSelectedProduct(null);
                setSynFormMsg({ text: '', type: '' });
                setSynShowForm(!synShowForm);
              }}
            >
              {synShowForm ? 'Ver Equivalencias' : '+ Nueva Equivalencia'}
            </button>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Gestione las equivalencias de descripciones de materiales para el proceso de Smart Import.
          </p>

          {synShowForm ? (
            <div style={{
              background: 'var(--bg-card-header)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '16px' }}>
                {synFormId ? 'Editar Equivalencia' : 'Nueva Equivalencia'}
              </h3>
              <form onSubmit={handleSaveSynonym}>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="synText">Texto del Sinónimo (Descripción en Excel) *</label>
                    <input 
                      type="text" 
                      id="synText" 
                      placeholder="Ej. TUBERIA DE FIERRO DE 2 PULGADAS"
                      value={synFormText}
                      onChange={(e) => setSynFormText(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="synTypeCol">Columna Correspondiente</label>
                    <select 
                      id="synTypeCol" 
                      value={synFormType}
                      onChange={(e) => setSynFormType(e.target.value)}
                    >
                      <option value="DESCRIPCION">DESCRIPCION</option>
                      <option value="TXT_LARGO">TXT_LARGO</option>
                      <option value="TXT_POS">TXT_POS</option>
                    </select>
                  </div>

                  <div className="form-group autocomplete-container" style={{ position: 'relative' }}>
                    <label htmlFor="synProductSearch">Buscar Producto Canonical *</label>
                    <input 
                      type="text" 
                      id="synProductSearch" 
                      placeholder="Buscar por código o nombre..."
                      value={synFormProductSearch}
                      onChange={(e) => handleSynProductSearchChange(e.target.value)}
                      required 
                      autoComplete="off"
                    />
                    {synFormProductSuggestions.length > 0 && (
                      <div className="autocomplete-dropdown" style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 999
                      }}>
                        {synFormProductSuggestions.map(p => (
                          <div 
                            key={p.codigo}
                            className="autocomplete-item"
                            onMouseDown={() => {
                              setSynFormSelectedProduct(p);
                              setSynFormProductSearch(`${p.codigo} - ${p.nombre}`);
                              setSynFormProductSuggestions([]);
                            }}
                          >
                            <span className="autocomplete-code">{p.codigo}</span>
                            <span className="autocomplete-name">{p.nombre}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {synFormSelectedProduct && (
                      <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓ Seleccionado:</span>
                        <strong>{synFormSelectedProduct.codigo}</strong>
                        <span>- {synFormSelectedProduct.nombre}</span>
                      </div>
                    )}
                  </div>
                </div>

                {synFormMsg.text && (
                  <div className={`message ${synFormMsg.type}`} style={{ marginTop: '16px' }}>
                    {synFormMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{synFormMsg.text}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setSynShowForm(false)}
                    disabled={synFormSaving}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-success"
                    disabled={synFormSaving}
                  >
                    {synFormSaving ? 'Guardando...' : 'Guardar Equivalencia'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              {/* Search & Filter bar */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <input 
                    type="text" 
                    placeholder="Buscar por sinónimo o código de producto..." 
                    value={synSearch}
                    onChange={(e) => setSynSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ width: '180px' }}>
                  <select 
                    value={synTypeFilter} 
                    onChange={(e) => {
                      setSynPage(1);
                      setSynTypeFilter(e.target.value);
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="ALL">Todas las columnas</option>
                    <option value="DESCRIPCION">DESCRIPCION</option>
                    <option value="TXT_LARGO">TXT_LARGO</option>
                    <option value="TXT_POS">TXT_POS</option>
                  </select>
                </div>
              </div>

              {synLoading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  <span className="spinner" style={{ display: 'inline-block', marginRight: '8px' }}></span>
                  Cargando equivalencias...
                </div>
              ) : synonymsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  No se encontraron equivalencias.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '12px 8px' }}>Texto Sinónimo (Excel)</th>
                        <th style={{ padding: '12px 8px' }}>Tipo Columna</th>
                        <th style={{ padding: '12px 8px' }}>Producto Asignado</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {synonymsList.map((syn) => (
                        <tr key={syn.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px 8px', fontWeight: '500' }}>{syn.texto_sinonimo}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: 'var(--primary)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}>
                              {syn.tipo_columna}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <div><strong>{syn.producto_codigo}</strong></div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {syn.producto ? syn.producto.nombre : 'Producto no encontrado'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button 
                                className="btn-icon" 
                                style={{ color: 'var(--text-primary)' }}
                                onClick={() => handleEditSynonymClick(syn)}
                                title="Editar Equivalencia"
                              >
                                <Pencil size={14} />
                              </button>
                              <button 
                                className="btn-icon text-danger" 
                                onClick={() => handleDeleteSynonym(syn.id, syn.texto_sinonimo)}
                                title="Eliminar Equivalencia"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  {synTotalCount > SYN_ROWS_PER_PAGE && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Mostrando {((synPage - 1) * SYN_ROWS_PER_PAGE) + 1} - {Math.min(synPage * SYN_ROWS_PER_PAGE, synTotalCount)} de {synTotalCount} equivalencias
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={() => setSynPage(p => Math.max(p - 1, 1))}
                          disabled={synPage === 1}
                        >
                          Anterior
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={() => setSynPage(p => Math.min(p + 1, Math.ceil(synTotalCount / SYN_ROWS_PER_PAGE)))}
                          disabled={synPage >= Math.ceil(synTotalCount / SYN_ROWS_PER_PAGE)}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Filters Config Card */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={18} />
            <span>Filtros de Validación (Smart Import)</span>
          </div>
          <button className="btn btn-secondary" onClick={fetchDynamicFilters} disabled={loadingFilters}>
            {loadingFilters ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          
          {/* Almaceneros */}
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Almaceneros (Para Salidas)
            </h3>
            <form onSubmit={handleAddAlmacenero} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Código" 
                value={newAlmaceneroCodigo} 
                onChange={(e) => setNewAlmaceneroCodigo(e.target.value)} 
                required 
                style={{ width: '30%' }}
              />
              <input 
                type="text" 
                placeholder="Nombre" 
                value={newAlmaceneroNombre} 
                onChange={(e) => setNewAlmaceneroNombre(e.target.value)} 
                required 
                style={{ width: '45%' }}
              />
              <button type="submit" className="btn btn-primary" style={{ width: '25%', padding: '8px 4px', fontSize: '0.8rem' }}>Añadir</button>
            </form>
            <div className="table-container" style={{ maxHeight: '250px', overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {almaceneros.length === 0 ? (
                    <tr><td colSpan="2" style={{ textAlign: 'center' }}>Sin registros</td></tr>
                  ) : (
                    almaceneros.map(a => (
                      <tr key={a.codigo}>
                        <td><strong>{a.codigo}</strong></td>
                        <td style={{ position: 'relative' }}>
                          <span>{a.nombre}</span>
                          <div className="row-actions-hover">
                            <button 
                              type="button"
                              className="btn btn-secondary" 
                              style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', height: '24px', cursor: 'pointer' }}
                              onClick={() => handleEditAlmaceneroClick(a)}
                              title="Editar"
                            >
                              <Pencil size={11} />
                            </button>
                            <button 
                              type="button"
                              className="btn btn-danger" 
                              style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', height: '24px', cursor: 'pointer' }}
                              onClick={() => handleDeleteAlmaceneroClick(a)}
                              title="Eliminar"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Disciplinas */}
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Disciplinas (Para Ingresos)
            </h3>
            <form onSubmit={handleAddDisciplina} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Nombre de la disciplina" 
                value={newDisciplinaNombre} 
                onChange={(e) => setNewDisciplinaNombre(e.target.value)} 
                required 
                style={{ width: '75%' }}
              />
              <button type="submit" className="btn btn-primary" style={{ width: '25%', padding: '8px 4px', fontSize: '0.8rem' }}>Añadir</button>
            </form>
            <div className="table-container" style={{ maxHeight: '250px', overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplinas.length === 0 ? (
                    <tr><td colSpan="1" style={{ textAlign: 'center' }}>Sin registros</td></tr>
                  ) : (
                    disciplinas.map(d => (
                      <tr key={d.nombre}>
                        <td style={{ position: 'relative' }}>
                          <strong>{d.nombre}</strong>
                          <div className="row-actions-hover">
                            <button 
                              type="button"
                              className="btn btn-secondary" 
                              style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', height: '24px', cursor: 'pointer' }}
                              onClick={() => handleEditDisciplinaClick(d)}
                              title="Editar"
                            >
                              <Pencil size={11} />
                            </button>
                            <button 
                              type="button"
                              className="btn btn-danger" 
                              style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', height: '24px', cursor: 'pointer' }}
                              onClick={() => handleDeleteDisciplinaClick(d)}
                              title="Eliminar"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* User Account Assignment Card */}
      {!checkingAdmin && isAdminUser && (
        <>
          <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <UserPlus size={18} />
              <span>Gestión de Usuarios</span>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setUserMsg({ text: '', type: '' });
              }}
            >
              {showCreateForm ? 'Ver Lista de Usuarios' : 'Registrar Nuevo Usuario'}
            </button>
          </div>
          <div className="card-body">
            
            {showCreateForm ? (
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px' }}>Crear Nuevo Usuario</h3>
                <form onSubmit={handleCreateUser}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="authAdminDni" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={16} style={{ color: 'var(--danger)' }} />
                        <span>DNI Autorizador *</span>
                      </label>
                      <input 
                        type="text" 
                        id="authAdminDni" 
                        placeholder="DNI de Administrador"
                        value={userAdminDni}
                        readOnly
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="newUserEmail" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} style={{ color: 'var(--primary)' }} />
                        <span>Correo Electrónico *</span>
                      </label>
                      <input 
                        type="email" 
                        id="newUserEmail" 
                        placeholder="correo@ejemplo.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="newUserPassword" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <KeyRound size={16} style={{ color: 'var(--primary)' }} />
                        <span>Contraseña *</span>
                      </label>
                      <input 
                        type="password" 
                        id="newUserPassword" 
                        placeholder="Mínimo 6 caracteres"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        required 
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: '20px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                      <input 
                        type="checkbox" 
                        checked={makeAdmin}
                        onChange={(e) => setMakeAdmin(e.target.checked)}
                        style={{ width: 'auto', margin: 0 }}
                      />
                      <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>¿Registrar también como Administrador?</span>
                    </label>
                  </div>

                  {makeAdmin && (
                    <div className="form-grid" style={{ 
                      background: 'var(--bg-card-header)', 
                      padding: '16px', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--border-color)',
                      marginBottom: '20px',
                      animation: 'fadeIn 0.3s ease'
                    }}>
                      <div className="form-group">
                        <label htmlFor="newAdminDni">DNI del Nuevo Administrador *</label>
                        <input 
                          type="text" 
                          id="newAdminDni" 
                          placeholder="8 dígitos"
                          value={newAdminDni}
                          onChange={(e) => setNewAdminDni(e.target.value.replace(/\D/g, ''))}
                          maxLength={8}
                          required={makeAdmin}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="newAdminNombre">Nombre del Nuevo Administrador *</label>
                        <input 
                          type="text" 
                          id="newAdminNombre" 
                          placeholder="Nombre Completo"
                          value={newAdminNombre}
                          onChange={(e) => setNewAdminNombre(e.target.value)}
                          required={makeAdmin}
                        />
                      </div>
                    </div>
                  )}

                  <div className="actions">
                    <button 
                      type="submit" 
                      className="btn btn-success" 
                      disabled={creatingUser}
                    >
                      <UserPlus size={16} />
                      <span>{creatingUser ? 'Registrando...' : 'Crear Usuario'}</span>
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>

              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px' }}>Lista de Usuarios Registrados</h3>
                {loadingUsers ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                    <span className="spinner" style={{ display: 'inline-block', marginRight: '8px' }}></span>
                    Cargando usuarios...
                  </div>
                ) : usersList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                    No se encontraron usuarios registrados.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '12px 8px' }}>Correo Electrónico</th>
                          <th style={{ padding: '12px 8px' }}>Rol</th>
                          <th style={{ padding: '12px 8px' }}>DNI / Nombre Admin</th>
                          <th style={{ padding: '12px 8px' }}>F. Registro</th>
                          <th style={{ padding: '12px 8px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => {
                          const isCurrentUser = u.email?.toLowerCase() === user?.email?.toLowerCase();
                          return (
                            <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'all 0.2s ease' }} className="table-row-hover">
                              <td style={{ padding: '12px 8px', fontWeight: '500' }}>
                                {u.email} {isCurrentUser && <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontStyle: 'italic' }}>(Tú)</span>}
                              </td>
                              <td style={{ padding: '12px 8px' }}>
                                {u.es_admin ? (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    background: 'rgba(16, 185, 129, 0.15)', 
                                    color: 'var(--success)', 
                                    padding: '4px 8px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.8rem', 
                                    fontWeight: '600' 
                                  }}>
                                    <ShieldCheck size={13} />
                                    Admin
                                  </span>
                                ) : (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    background: 'rgba(107, 114, 128, 0.15)', 
                                    color: 'var(--text-secondary)', 
                                    padding: '4px 8px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.8rem', 
                                    fontWeight: '600' 
                                  }}>
                                    <User size={13} />
                                    Operario
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                {u.es_admin ? (
                                  <div>
                                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{u.admin_nombre}</div>
                                    <div>DNI: {u.admin_dni}</div>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                {u.created_at ? new Date(u.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                              </td>
                              <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '8px' }}>
                                  {u.es_admin ? (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '100px', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
                                      onClick={() => handleDemoteUser(u.admin_dni, u.email)}
                                      disabled={isCurrentUser}
                                      title={isCurrentUser ? "No puedes quitarte los permisos a ti mismo" : "Quitar Administrador"}
                                    >
                                      <UserMinus size={12} />
                                      <span>Quitar Admin</span>
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn-primary"
                                      style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '100px', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
                                      onClick={() => {
                                        setPromoDni('');
                                        setPromoNombre('');
                                        setPromoError('');
                                        setPromotingUser(u);
                                      }}
                                    >
                                      <ShieldCheck size={12} />
                                      <span>Hacer Admin</span>
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-danger"
                                    style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: isCurrentUser ? 'not-allowed' : 'pointer' }}
                                    onClick={() => handleDeleteUser(u.id, u.email)}
                                    disabled={isCurrentUser}
                                    title={isCurrentUser ? "No puedes eliminar tu cuenta" : "Eliminar Usuario"}
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
                )}
              </div>
            )}

            {userMsg.text && (
              <div className={`message ${userMsg.type}`} style={{ marginTop: '20px' }}>
                {userMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{userMsg.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Audit Log Card */}
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Settings size={18} />
              <span>Historial de Auditoría (Logs de Cambios)</span>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              onClick={fetchAuditLogs}
              disabled={loadingAuditLogs}
            >
              {loadingAuditLogs ? 'Cargando...' : 'Actualizar Logs'}
            </button>
          </div>
          <div className="card-body">
            <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Registro de las últimas 100 modificaciones de productos y movimientos realizadas en el sistema.
            </p>

            {loadingAuditLogs ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                <span className="spinner" style={{ display: 'inline-block', marginRight: '8px' }}></span>
                Cargando historial de auditoría...
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                No se han registrado eventos de auditoría aún.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '10px 6px' }}>Fecha</th>
                      <th style={{ padding: '10px 6px' }}>Usuario</th>
                      <th style={{ padding: '10px 6px' }}>Tabla</th>
                      <th style={{ padding: '10px 6px' }}>Acción</th>
                      <th style={{ padding: '10px 6px' }}>ID Registro</th>
                      <th style={{ padding: '10px 6px' }}>Cambios / Detalles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => {
                      let opBadgeStyle = {
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      };

                      if (log.operacion === 'INSERT') {
                        opBadgeStyle = { ...opBadgeStyle, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' };
                      } else if (log.operacion === 'DELETE') {
                        opBadgeStyle = { ...opBadgeStyle, background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)' };
                      } else {
                        opBadgeStyle = { ...opBadgeStyle, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--primary)' };
                      }

                      return (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '10px 6px', color: 'var(--text-secondary)' }}>
                            {log.fecha ? new Date(log.fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ padding: '10px 6px', fontWeight: '500' }}>{log.usuario_email}</td>
                          <td style={{ padding: '10px 6px', textTransform: 'capitalize' }}>{log.tabla}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <span style={opBadgeStyle}>{log.operacion}</span>
                          </td>
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{log.registro_id}</td>
                          <td style={{ padding: '10px 6px', fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px', wordBreak: 'break-word' }}>
                            {renderAuditDetails(log)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>


        </>
      )}

        {/* Security Backups Card */}
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Database size={18} />
              <span>Respaldos de Seguridad</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-success" 
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={handleManualBackup}
                disabled={creatingBackup}
              >
                {creatingBackup ? 'Respaldando...' : 'Generar Respaldo Manual'}
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={fetchBackups}
                disabled={loadingBackups}
              >
                {loadingBackups ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
          </div>
          <div className="card-body">
            <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Historial de respaldos automáticos semanales (domingos) y manuales. Cada respaldo captura el estado de los productos y movimientos.
            </p>

            {loadingBackups ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                <span className="spinner" style={{ display: 'inline-block', marginRight: '8px' }}></span>
                Cargando historial de respaldos...
              </div>
            ) : backupsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                No se han registrado respaldos de seguridad.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '10px 6px' }}>Fecha de Respaldo</th>
                      <th style={{ padding: '10px 6px' }}>Creado Por</th>
                      <th style={{ padding: '10px 6px', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupsList.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px 6px', fontWeight: '500' }}>
                          {b.fecha ? new Date(b.fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '10px 6px', color: 'var(--text-secondary)' }}>{b.creado_por}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => downloadBackupAsExcel(b.id, b.fecha)}
                          >
                            <Download size={12} />
                            <span>Descargar Excel</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      {/* Reusable step-by-step Reset Confirmation Modal */}
      {showResetModal && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                <span style={{ fontWeight: '700', letterSpacing: '0.3px' }}>Advertencia de Restablecimiento</span>
              </div>
            </div>

            <div className="card-body" style={{ padding: '24px', textAlign: 'center' }}>
              
              {/* Premium Visual Step Progress Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  background: resetStep === 1 ? 'var(--primary-glow)' : 'transparent',
                  border: resetStep === 1 ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: resetStep === 1 ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.3s ease'
                }}>
                  1. Autorización
                </div>
                <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }}></div>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  background: resetStep === 2 ? 'var(--primary-glow)' : 'transparent',
                  border: resetStep === 2 ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: resetStep === 2 ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.3s ease'
                }}>
                  2. Confirmación
                </div>
                <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }}></div>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  background: resetStep === 3 ? 'var(--primary-glow)' : 'transparent',
                  border: resetStep === 3 ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: resetStep === 3 ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.3s ease'
                }}>
                  3. Listo
                </div>
              </div>

              {/* Step 1: Warnings and DNI form */}
              {resetStep === 1 && (
                <div>
                  <div style={{
                    background: 'var(--danger-bg)',
                    borderLeft: '4px solid var(--danger)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    color: 'var(--danger-text)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center'
                  }}>
                    <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                    <span>
                      Esta acción eliminará permanentemente <strong>TODOS los registros de productos</strong> y sus <strong>movimientos históricos</strong> del almacén. Esta operación es irreversible.
                    </span>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <label htmlFor="resetDniInput" style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.875rem' }}>
                      DNI
                    </label>
                    <input 
                      type="text" 
                      id="resetDniInput" 
                      placeholder="8 dígitos" 
                      value={dni}
                      onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                      maxLength={8}
                      autoComplete="off"
                      style={{ maxWidth: '120px', width: '100%', textAlign: 'center', fontSize: '0.95rem', padding: '10px 12px' }}
                    />
                    {dniError && (
                      <span style={{ color: 'var(--danger)', fontSize: '0.825rem', marginTop: '6px', fontWeight: '600', display: 'block' }}>
                        {dniError}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '28px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleGoToStep2}>
                      Continuar
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Final confirmation step */}
              {resetStep === 2 && (
                <div>
                  <div style={{
                    background: 'var(--warning-bg)',
                    borderLeft: '4px solid var(--warning)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    color: 'var(--warning-text)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center'
                  }}>
                    <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
                    <span>
                      Se guardará el registro de restablecimiento bajo la identificación DNI: <strong>{dni}</strong>.
                    </span>
                  </div>

                  {resetError && (
                    <div className="message error" style={{ marginBottom: '16px' }}>
                      <AlertCircle size={16} />
                      <span>{resetError}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '28px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => setResetStep(1)}
                      disabled={resetting}
                    >
                      Atrás
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-danger" 
                      onClick={handleExecuteReset}
                      disabled={resetting}
                    >
                      {resetting ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', marginBottom: 0 }}></span>
                          <span>Restableciendo...</span>
                        </div>
                      ) : (
                        'Restablecer Todo'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Success view */}
              {resetStep === 3 && (
                <div>
                  <div style={{
                    background: 'var(--success-bg)',
                    borderLeft: '4px solid var(--success)',
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '20px',
                    color: 'var(--success-text)',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    lineHeight: '1.6'
                  }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      background: 'rgba(16, 185, 129, 0.15)', 
                      borderRadius: '50%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      margin: '0 auto 12px auto',
                      color: 'var(--success)'
                    }}>
                      <CheckCircle2 size={28} />
                    </div>
                    <h4 style={{ fontWeight: '700', marginBottom: '8px', fontSize: '1.05rem', letterSpacing: '0.2px' }}>¡Restablecimiento Completado!</h4>
                    La base de datos ha sido restablecida a su estado inicial de forma exitosa. Todos los productos y logs de movimientos fueron eliminados de forma segura.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
                    <button type="button" className="btn btn-success" onClick={() => setShowResetModal(false)}>
                      Cerrar
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Promotion Modal */}
      {promotingUser && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: '700' }}>Asignar Rol Administrador</span>
              </div>
              <button 
                type="button" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                onClick={() => setPromotingUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePromoteSubmit}>
              <div className="card-body" style={{ padding: '20px' }}>
                <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  El usuario <strong>{promotingUser.email}</strong> tendrá permisos completos de administración. Ingrese sus datos personales.
                </p>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="promoDni" style={{ fontWeight: '600', display: 'block', marginBottom: '6px' }}>DNI *</label>
                  <input 
                    type="text" 
                    id="promoDni" 
                    placeholder="8 dígitos" 
                    value={promoDni}
                    onChange={(e) => setPromoDni(e.target.value.replace(/\D/g, ''))}
                    maxLength={8}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="promoNombre" style={{ fontWeight: '600', display: 'block', marginBottom: '6px' }}>Nombre Completo *</label>
                  <input 
                    type="text" 
                    id="promoNombre" 
                    placeholder="Nombres y Apellidos" 
                    value={promoNombre}
                    onChange={(e) => setPromoNombre(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                {promoError && (
                  <div className="message error" style={{ marginBottom: '12px' }}>
                    <AlertCircle size={14} />
                    <span style={{ fontSize: '0.8rem' }}>{promoError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setPromotingUser(null)} disabled={promotingAction}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={promotingAction}>
                    {promotingAction ? 'Guardando...' : 'Asignar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Almacenero Modal */}
      {editingAlmacenero && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: '700' }}>Editar Almacenero</span>
              </div>
              <button 
                type="button" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                onClick={() => setEditingAlmacenero(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmEditAlmacenero}>
              <div className="card-body" style={{ padding: '20px' }}>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="editAlmaceneroCodigo" style={{ fontWeight: '600', display: 'block', marginBottom: '6px' }}>Código *</label>
                  <input 
                    type="text" 
                    id="editAlmaceneroCodigo" 
                    value={editAlmaceneroCodigo}
                    onChange={(e) => setEditAlmaceneroCodigo(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="editAlmaceneroNombre" style={{ fontWeight: '600', display: 'block', marginBottom: '6px' }}>Nombre *</label>
                  <input 
                    type="text" 
                    id="editAlmaceneroNombre" 
                    value={editAlmaceneroNombre}
                    onChange={(e) => setEditAlmaceneroNombre(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                {filterActionError && (
                  <div className="message error" style={{ marginBottom: '12px' }}>
                    <AlertCircle size={14} />
                    <span style={{ fontSize: '0.8rem' }}>{filterActionError}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingAlmacenero(null)} disabled={savingAlmacenero}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingAlmacenero}>
                    {savingAlmacenero ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Disciplina Modal */}
      {editingDisciplina && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: '700' }}>Editar Disciplina</span>
              </div>
              <button 
                type="button" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                onClick={() => setEditingDisciplina(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmEditDisciplina}>
              <div className="card-body" style={{ padding: '20px' }}>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="editDisciplinaNombre" style={{ fontWeight: '600', display: 'block', marginBottom: '6px' }}>Nombre de la Disciplina *</label>
                  <input 
                    type="text" 
                    id="editDisciplinaNombre" 
                    value={editDisciplinaNombre}
                    onChange={(e) => setEditDisciplinaNombre(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                {filterActionError && (
                  <div className="message error" style={{ marginBottom: '12px' }}>
                    <AlertCircle size={14} />
                    <span style={{ fontSize: '0.8rem' }}>{filterActionError}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingDisciplina(null)} disabled={savingDisciplina}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingDisciplina}>
                    {savingDisciplina ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Almacenero Confirmation Modal */}
      {deletingAlmacenero && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--danger)' }}>
              <span style={{ fontWeight: '700' }}>⚠️ Confirmar Eliminación de Almacenero</span>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', lineHeight: '1.5', fontSize: '0.9rem', textAlign: 'center' }}>
                ¿Está seguro de que desea eliminar permanentemente este almacenero?
              </p>
              
              <div style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <h4 style={{ fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>Detalles:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span>• Código: <strong>{deletingAlmacenero.codigo}</strong></span>
                  <span>• Nombre: <strong>{deletingAlmacenero.nombre}</strong></span>
                </div>
              </div>

              {filterActionError && (
                <div className="message error" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} />
                  <span>{filterActionError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ minWidth: '120px' }}
                  onClick={() => setDeletingAlmacenero(null)}
                  disabled={savingAlmacenero}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-danger" 
                  style={{ minWidth: '180px', background: '#ef4444', color: '#ffffff' }}
                  onClick={handleConfirmDeleteAlmacenero}
                  disabled={savingAlmacenero}
                >
                  {savingAlmacenero ? 'Eliminando...' : 'Confirmar Eliminación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Disciplina Confirmation Modal */}
      {deletingDisciplina && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--danger)' }}>
              <span style={{ fontWeight: '700' }}>⚠️ Confirmar Eliminación de Disciplina</span>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', lineHeight: '1.5', fontSize: '0.9rem', textAlign: 'center' }}>
                ¿Está seguro de que desea eliminar permanentemente esta disciplina?
              </p>
              
              <div style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <h4 style={{ fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>Detalles:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span>• Disciplina: <strong>{deletingDisciplina.nombre}</strong></span>
                </div>
              </div>

              {filterActionError && (
                <div className="message error" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} />
                  <span>{filterActionError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ minWidth: '120px' }}
                  onClick={() => setDeletingDisciplina(null)}
                  disabled={savingDisciplina}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-danger" 
                  style={{ minWidth: '180px', background: '#ef4444', color: '#ffffff' }}
                  onClick={handleConfirmDeleteDisciplina}
                  disabled={savingDisciplina}
                >
                  {savingDisciplina ? 'Eliminando...' : 'Confirmar Eliminación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
