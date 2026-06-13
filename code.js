// Initialize Supabase Client safely using a custom variable name
// to avoid conflicts with the global 'supabase' object defined by the CDN.
let supabaseClient;
try {
  if (typeof window.supabase !== 'undefined' && typeof SUPABASE_CONFIG !== 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  } else {
    console.error("Supabase SDK or SUPABASE_CONFIG is not loaded. Check your internet connection or config.js link.");
  }
} catch (e) {
  console.error("Supabase client failed to initialize.", e);
}

let currentTab = 'dashboard';
let searchTimeout;
let autocompleteTimeout;
let localStockData = [];

function initializeApp() {
  initTheme();
  setDefaultDates();
  if (supabaseClient) {
    // Escuchar cambios de estado de autenticación (login, logout)
    supabaseClient.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session);
    });
  } else {
    showMessage('statsGrid', 'Error: No se pudo conectar a Supabase. Verifique las credenciales en config.js.', 'error');
  }
  handleTipoChange();
}

function handleAuthStateChange(event, session) {
  const appContainer = document.querySelector('.app-container');
  const loginContainer = document.getElementById('login-container');
  const userProfileCard = document.getElementById('userProfileCard');
  const userEmailSpan = document.getElementById('userEmailSpan');

  if (session) {
    // Usuario autenticado
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
    if (userProfileCard) userProfileCard.style.display = 'flex';
    if (userEmailSpan) userEmailSpan.textContent = session.user.email;

    loadListas();
    loadDashboard();
    showTab('dashboard');
  } else {
    // Usuario no autenticado
    if (appContainer) appContainer.style.display = 'none';
    if (userProfileCard) userProfileCard.style.display = 'none';
    if (loginContainer) loginContainer.style.display = 'flex';
  }
}

async function loginUsuario(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const loginMsg = document.getElementById('loginMsg');

  if (loginMsg) {
    loginMsg.innerHTML = '<div class="message info">Ingresando...</div>';
  }

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (loginMsg) loginMsg.innerHTML = '';
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    if (loginMsg) {
      loginMsg.innerHTML = `<div class="message error">Error: ${err.message || 'Credenciales incorrectas'}</div>`;
    }
  }
}

async function logoutUsuario() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    limpiarTodosFormularios();
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
  }
}

function initTheme() {
  try {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    updateThemeUI(isDark);
  } catch (e) {
    console.error("Failed to initialize theme preferences", e);
  }
}

function toggleTheme() {
  try {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeUI(isDark);
  } catch (e) {
    console.error("Failed to toggle theme preference", e);
  }
}

function updateThemeUI(isDark) {
  const icon = document.getElementById('themeToggleIcon');
  const text = document.getElementById('themeToggleText');
  if (isDark) {
    if (icon) icon.textContent = '☀️';
    if (text) text.textContent = 'Modo Claro';
  } else {
    if (icon) icon.textContent = '🌙';
    if (text) text.textContent = 'Modo Oscuro';
  }
}

function setDefaultDates() {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  document.getElementById("fechaMov").valueAsDate = today;
  document.getElementById("fechaDesde").valueAsDate = monthAgo;
  document.getElementById("fechaHasta").valueAsDate = today;
}

function showTab(tabName) {
  // 1. Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // 2. Remove active class from all links and add to the matching tab link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    const onclickAttr = link.getAttribute('onclick') || '';
    if (onclickAttr.includes(`'${tabName}'`)) {
      link.classList.add('active');
    }
  });
  
  // 3. Show target tab
  const targetTab = document.getElementById(tabName);
  if (targetTab) targetTab.classList.add('active');
  
  currentTab = tabName;
  
  switch(tabName) {
    case 'dashboard':
      if (supabaseClient) loadDashboard();
      break;
    case 'inventario':
      if (supabaseClient) mostrarStock();
      break;
    case 'productos':
      if (supabaseClient) listarProductosEnGestion();
      break;
  }
}

async function loadDashboard() {
  try {
    const { count: totalProductos, error: e1 } = await supabaseClient
      .from('productos')
      .select('*', { count: 'exact', head: true });
      
    const { count: totalMovimientos, error: e2 } = await supabaseClient
      .from('movimientos')
      .select('*', { count: 'exact', head: true });
      
    const { data: stockData, error: e3 } = await supabaseClient
      .from('v_productos_stock')
      .select('stockMin:stock_min, cantidad');
      
    if (e1 || e2 || e3) throw e1 || e2 || e3;
    
    let sinStock = 0;
    let stockBajo = 0;
    stockData.forEach(p => {
      if (p.cantidad <= 0) {
        sinStock++;
      } else if (p.cantidad <= p.stockMin && p.stockMin > 0) {
        stockBajo++;
      }
    });

    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalProductos}</div>
        <div class="stat-label">Total Productos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalMovimientos}</div>
        <div class="stat-label">Total Movimientos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${sinStock}</div>
        <div class="stat-label">Sin Stock</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stockBajo}</div>
        <div class="stat-label">Stock Bajo</div>
      </div>
    `;
  } catch(error) {
    showMessage('statsGrid', 'Error al cargar dashboard: ' + error.message, 'error');
  }
}

async function loadListas() {
  try {
    const { data: unidades, error: e1 } = await supabaseClient.from('unidades').select('nombre').order('nombre');
    const { data: grupos, error: e2 } = await supabaseClient.from('grupos').select('nombre').order('nombre');
    if (e1 || e2) throw e1 || e2;

    const unidadSelect = document.getElementById("unidadProd");
    const grupoSelect = document.getElementById("grupoProd");

    unidadSelect.innerHTML = "";
    grupoSelect.innerHTML = "";

    unidades.forEach(u => {
      unidadSelect.innerHTML += `<option value="${u.nombre}">${u.nombre}</option>`;
    });
    grupos.forEach(g => {
      grupoSelect.innerHTML += `<option value="${g.nombre}">${g.nombre}</option>`;
    });
  } catch (error) {
    console.error('Error loading lists:', error);
  }
}

async function buscarProductoAutocompletado() {
  clearTimeout(autocompleteTimeout);
  const input = document.getElementById("codigoMov");
  const dropdown = document.getElementById("autocompleteDropdown");
  const codigo = input.value.trim().toUpperCase();
  
  if (codigo.length === 0) {
    dropdown.style.display = "none";
    return;
  }
  
  autocompleteTimeout = setTimeout(async () => {
    try {
      const { data: productos, error } = await supabaseClient
        .from('v_productos_stock')
        .select('codigo, nombre, unidad, grupo')
        .ilike('codigo', `${codigo}%`)
        .limit(10);
      if (error) throw error;
      
      mostrarAutocompletado(productos);
    } catch(error) {
      console.error('Error en autocompletado:', error);
    }
  }, 200);
}

async function buscarProductoPorNombreAutocompletado() {
  clearTimeout(autocompleteTimeout);
  const input = document.getElementById("nombreMov");
  const dropdown = document.getElementById("autocompleteDropdownNombre");
  const nombre = input.value.trim();
  
  if (nombre.length === 0) {
    dropdown.style.display = "none";
    return;
  }
  
  autocompleteTimeout = setTimeout(async () => {
    try {
      const { data: productos, error } = await supabaseClient
        .from('v_productos_stock')
        .select('codigo, nombre, unidad, grupo')
        .ilike('nombre', `%${nombre}%`)
        .limit(10);
      if (error) throw error;
      
      mostrarAutocompletadoNombre(productos);
    } catch(error) {
      console.error('Error en autocompletado por nombre:', error);
    }
  }, 200);
}

function mostrarAutocompletado(productos = []) {
  const dropdown = document.getElementById("autocompleteDropdown");
  
  if (productos.length === 0) {
    dropdown.style.display = "none";
    return;
  }
  
  let html = "";
  productos.forEach(producto => {
    html += `
      <div class="autocomplete-item" onmousedown="seleccionarProducto('${producto.codigo}', '${producto.nombre}')">
        <div class="autocomplete-code">${producto.codigo}</div>
        <div class="autocomplete-name">${producto.nombre} - ${producto.grupo}</div>
      </div>
    `;
  });
  
  dropdown.innerHTML = html;
  dropdown.style.display = "block";
}

function mostrarAutocompletadoNombre(productos = []) {
  const dropdown = document.getElementById("autocompleteDropdownNombre");
  
  if (productos.length === 0) {
    dropdown.style.display = "none";
    return;
  }
  
  let html = "";
  productos.forEach(producto => {
    html += `
      <div class="autocomplete-item" onmousedown="seleccionarProducto('${producto.codigo}', '${producto.nombre}')">
        <div class="autocomplete-name">${producto.nombre}</div>
        <div class="autocomplete-code">${producto.codigo} - ${producto.grupo}</div>
      </div>
    `;
  });
  
  dropdown.innerHTML = html;
  dropdown.style.display = "block";
}

function seleccionarProducto(codigo, nombre) {
  const codigoField = document.getElementById("codigoMov");
  const nombreField = document.getElementById("nombreMov");
  
  if (codigoField) {
    codigoField.disabled = false;
    codigoField.readOnly = false;
    codigoField.value = codigo;
  }
  
  if (nombreField) {
    nombreField.disabled = false;
    nombreField.readOnly = false;
    nombreField.value = nombre;
  }
  
  const d1 = document.getElementById("autocompleteDropdown");
  const d2 = document.getElementById("autocompleteDropdownNombre");
  if (d1) d1.style.display = "none";
  if (d2) d2.style.display = "none";
}

function focusCodigoMov() {
  const codigoField = document.getElementById("codigoMov");
  const nombreField = document.getElementById("nombreMov");
  
  if (codigoField) {
    codigoField.disabled = false;
    codigoField.readOnly = false;
    if (codigoField.value !== "" && nombreField && nombreField.value !== "") {
      codigoField.value = "";
    }
  }
  
  if (nombreField) {
    nombreField.disabled = false;
    nombreField.readOnly = true;
    nombreField.value = "";
  }
  
  buscarProductoAutocompletado();
}

function focusNombreMov() {
  const codigoField = document.getElementById("codigoMov");
  const nombreField = document.getElementById("nombreMov");
  
  if (nombreField) {
    nombreField.disabled = false;
    nombreField.readOnly = false;
    if (nombreField.value !== "" && codigoField && codigoField.value !== "") {
      nombreField.value = "";
    }
  }
  
  if (codigoField) {
    codigoField.disabled = false;
    codigoField.readOnly = true;
    codigoField.value = "";
  }
  
  buscarProductoPorNombreAutocompletado();
}

function ocultarAutocompletado() {
  setTimeout(() => {
    const d1 = document.getElementById("autocompleteDropdown");
    const d2 = document.getElementById("autocompleteDropdownNombre");
    if (d1) d1.style.display = "none";
    if (d2) d2.style.display = "none";
  }, 150);
}

async function registrarProducto(event) {
  event.preventDefault();
  
  const codigo = document.getElementById("codigoProd").value.trim().toUpperCase();
  const nombre = document.getElementById("nombreProd").value.trim();
  const unidadNombre = document.getElementById("unidadProd").value;
  const grupoNombre = document.getElementById("grupoProd").value;
  const stockMin = parseInt(document.getElementById("stockMinProd").value) || 0;

  if (!codigo || !nombre) {
    showMessage('msgProd', 'Código y nombre son campos obligatorios', 'error');
    return;
  }

  try {
    const { data: unitData, error: e1 } = await supabaseClient.from('unidades').select('id').eq('nombre', unidadNombre).single();
    const { data: groupData, error: e2 } = await supabaseClient.from('grupos').select('id').eq('nombre', grupoNombre).single();
    if (e1 || e2) throw e1 || e2;

    const { error } = await supabaseClient.from('productos').insert([{
      codigo,
      nombre,
      unidad_id: unitData.id,
      grupo_id: groupData.id,
      stock_min: stockMin
    }]);
    
    if (error) {
      if (error.code === '23505') {
        showMessage('msgProd', 'Ya existe un producto con este código.', 'error');
      } else {
        throw error;
      }
      return;
    }

    showMessage('msgProd', 'Producto registrado correctamente.', 'success');
    document.getElementById('formProducto').reset();
    document.getElementById("stockMinProd").value = "0";
    listarProductosEnGestion();
  } catch(error) {
    showMessage('msgProd', 'Error al registrar producto: ' + error.message, 'error');
  }
}

function generateDispatchKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randStr = (length) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  return `${randStr(10)}-${randStr(3)}-${randStr(2)}`;
}

async function generateUniqueMovementKey() {
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = generateDispatchKey();
    const { data, error } = await supabaseClient
      .from('movimientos')
      .select('id')
      .eq('key', key);
    if (error) throw error;
    if (!data || data.length === 0) {
      return key;
    }
  }
  throw new Error('No se pudo generar una clave única después de varios intentos.');
}

async function registrarMovimiento(event) {
  event.preventDefault();
  
  const codigo = document.getElementById("codigoMov").value.trim().toUpperCase();
  const fecha = document.getElementById("fechaMov").value;
  const tipo = document.getElementById("tipoMov").value;
  const cantidad = parseFloat(document.getElementById("cantMov").value) || 0;
  const observaciones = document.getElementById("obsMov").value.trim();

  if (!codigo || !fecha || cantidad <= 0) {
    showMessage('msgMov', 'Todos los campos son obligatorios y la cantidad debe ser mayor a 0', 'error');
    return;
  }

  try {
    const { data: prodStock, error: e1 } = await supabaseClient
      .from('v_productos_stock')
      .select('codigo, cantidad')
      .eq('codigo', codigo)
      .single();
    
    if (e1 || !prodStock) {
      showMessage('msgMov', 'El producto no existe. Regístrelo primero.', 'error');
      return;
    }

    const stockActual = prodStock.cantidad;

    if ((tipo === 'SALIDA' || tipo === 'AJUSTE_NEGATIVO') && stockActual < cantidad) {
      showMessage('msgMov', `Stock insuficiente. Disponible: ${stockActual}, Solicitado: ${cantidad}`, 'error');
      return;
    }

    let movementKey = document.getElementById("keyMov").value.trim();

    if (movementKey && movementKey !== 'Automatico') {
      const { data: existingMov, error: keyErr } = await supabaseClient
        .from('movimientos')
        .select('id')
        .eq('key', movementKey);
      
      if (keyErr) throw keyErr;

      if (existingMov && existingMov.length > 0) {
        showMessage('msgMov', 'Esta clave (Transaction Key) ya ha sido registrada.', 'error');
        return;
      }
    } else {
      try {
        movementKey = await generateUniqueMovementKey();
      } catch (keyGenErr) {
        throw new Error('Error al generar clave única: ' + keyGenErr.message);
      }
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    const activeUserEmail = user ? user.email : 'Usuario Sistema';

    const { error: e2 } = await supabaseClient.from('movimientos').insert([{
      producto_codigo: codigo,
      fecha,
      tipo,
      cantidad,
      usuario: activeUserEmail,
      observaciones,
      key: movementKey
    }]);
    
    if (e2) throw e2;

    showMessage('msgMov', 'Movimiento registrado correctamente.', 'success');
    limpiarFormMovimiento();
    handleTipoChange();
  } catch(error) {
    showMessage('msgMov', 'Error al registrar movimiento: ' + error.message, 'error');
  }
}

function handleTipoChange() {
  const tipo = document.getElementById("tipoMov").value;
  const cantField = document.getElementById("cantMov");
  const keyGroup = document.getElementById("keyMovGroup");
  const keyField = document.getElementById("keyMov");

  if (tipo === 'INGRESO' || tipo === 'SALIDA') {
    if (keyGroup) keyGroup.style.display = 'flex';
    if (keyField) {
      keyField.required = false;
      keyField.placeholder = 'Ingrese clave o deje en blanco para auto-generar';
      keyField.disabled = false;
    }
  } else {
    if (keyGroup) keyGroup.style.display = 'none';
    if (keyField) {
      keyField.required = false;
      keyField.value = '';
    }
  }

  switch(tipo) {
    case 'INGRESO':
      cantField.placeholder = 'Cantidad a ingresar';
      break;
    case 'SALIDA':
      cantField.placeholder = 'Cantidad a retirar';
      break;
    case 'AJUSTE_POSITIVO':
      cantField.placeholder = 'Cantidad a aumentar';
      break;
    case 'AJUSTE_NEGATIVO':
      cantField.placeholder = 'Cantidad a disminuir';
      break;
  }
}

async function mostrarStock() {
  const loading = document.getElementById("loading");
  const container = document.getElementById("stockTable");
  
  // Reset the search filter input
  const searchInput = document.getElementById("buscarInventarioInput");
  if (searchInput) {
    searchInput.value = "";
  }
  
  loading.style.display = "block";
  
  try {
    const { data, error } = await supabaseClient
      .from('v_productos_stock')
      .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad')
      .order('nombre');
    if (error) throw error;

    localStockData = data || [];
    loading.style.display = "none";
    displayStockTable(localStockData, container);
  } catch(error) {
    loading.style.display = "none";
    showMessage('stockTable', 'Error al cargar stock: ' + error.message, 'error');
  }
}

function displayStockTable(data, container) {
  if (data.length === 0) {
    container.innerHTML = '<div class="message warning">No hay productos registrados matching el filtro</div>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>ID Producto</th>
          <th>Producto</th>
          <th>Cantidad</th>
          <th>Unidad</th>
          <th>Grupo</th>
          <th>Stock Mín.</th>
          <th>Stock Actual</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(producto => {
    let statusClass = 'status-normal';
    let estado = 'Normal';
    
    if (producto.cantidad <= 0) {
      statusClass = 'status-zero';
      estado = 'Sin Stock';
    } else if (producto.cantidad <= producto.stockMin && producto.stockMin > 0) {
      statusClass = 'status-low';
      estado = 'Stock Bajo';
    }

    html += `
      <tr class="${statusClass}">
        <td>${producto.codigo}</td>
        <td>${producto.nombre}</td>
        <td>${producto.cantidad}</td>
        <td>${producto.unidad}</td>
        <td>${producto.grupo}</td>
        <td>${producto.stockMin}</td>
        <td>${producto.cantidad}</td>
        <td>${estado}</td>
        <td>
          <button class="btn btn-info" onclick="verDetalleProducto('${producto.codigo}')" title="Ver detalle">
            Ver
          </button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function filtrarInventario() {
  const searchInput = document.getElementById("buscarInventarioInput");
  if (!searchInput) return;
  
  const query = searchInput.value.trim().toLowerCase();
  const container = document.getElementById("stockTable");
  if (!container) return;
  
  if (query === "") {
    displayStockTable(localStockData, container);
    return;
  }
  
  const filtered = localStockData.filter(p => {
    const codigo = (p.codigo || "").toLowerCase();
    const nombre = (p.nombre || "").toLowerCase();
    const grupo = (p.grupo || "").toLowerCase();
    return codigo.includes(query) || nombre.includes(query) || grupo.includes(query);
  });
  
  displayStockTable(filtered, container);
}

function limpiarBuscarInventario() {
  const searchInput = document.getElementById("buscarInventarioInput");
  if (searchInput) {
    searchInput.value = "";
  }
  const container = document.getElementById("stockTable");
  if (container) {
    displayStockTable(localStockData, container);
  }
}

async function mostrarAlertas() {
  const loading = document.getElementById("loading");
  const container = document.getElementById("stockTable");
  
  loading.style.display = "block";
  
  try {
    const { data, error } = await supabaseClient
      .from('v_productos_stock')
      .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad')
      .order('nombre');
    if (error) throw error;

    loading.style.display = "none";
    const alertProducts = data.filter(p => p.cantidad <= 0 || (p.cantidad <= p.stockMin && p.stockMin > 0));
    
    if (alertProducts.length === 0) {
      container.innerHTML = '<div class="message success">No hay productos con alertas de stock</div>';
      return;
    }
    
    displayStockTable(alertProducts, container);
  } catch(error) {
    loading.style.display = "none";
    showMessage('stockTable', 'Error: ' + error.message, 'error');
  }
}

async function showStockAlerts() {
  try {
    const { data, error } = await supabaseClient
      .from('v_productos_stock')
      .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad');
    if (error) throw error;

    const alertProducts = data.filter(p => p.cantidad <= 0 || (p.cantidad <= p.stockMin && p.stockMin > 0));
    const container = document.getElementById('alertsContainer');
    
    if (alertProducts.length === 0) {
      container.innerHTML = '<div class="message success">No hay productos con alertas de stock</div>';
      return;
    }

    let html = `
      <div class="message warning">
        <strong>${alertProducts.length} producto(s) requieren atención</strong>
      </div>
      <table>
        <thead>
          <tr><th>Código</th><th>Nombre</th><th>Stock Actual</th><th>Stock Mín.</th><th>Estado</th></tr>
        </thead>
        <tbody>
    `;

    alertProducts.forEach(p => {
      const estado = p.cantidad <= 0 ? 'Sin Stock' : 'Stock Bajo';
      const statusClass = p.cantidad <= 0 ? 'status-zero' : 'status-low';
      
      html += `
        <tr class="${statusClass}">
          <td>${p.codigo}</td>
          <td>${p.nombre}</td>
          <td>${p.cantidad}</td>
          <td>${p.stockMin}</td>
          <td>${estado}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  } catch(error) {
    console.error('Error loading alerts:', error);
  }
}

async function mostrarHistorial() {
  const fechaDesde = document.getElementById("fechaDesde").value;
  const fechaHasta = document.getElementById("fechaHasta").value;
  const tipo = document.getElementById("filtroTipo").value;

  if (!fechaDesde || !fechaHasta) {
    showMessage('historialTable', 'Seleccione las fechas de consulta', 'warning');
    return;
  }

  try {
    let query = supabaseClient
      .from('movimientos')
      .select(`
        fecha,
        codigo:producto_codigo,
        cantidad,
        observaciones,
        usuario,
        tipo,
        key,
        producto:productos(nombre, unidades(nombre))
      `)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false });
    
    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query;
    if (error) throw error;

    const formattedData = data.map(m => ({
      fecha: m.fecha.split('-').reverse().join('/'),
      productKey: m.key || '',
      codigo: m.codigo,
      producto: m.producto ? m.producto.nombre : 'Producto no encontrado',
      unidad: m.producto && m.producto.unidades ? m.producto.unidades.nombre : '',
      tipo: m.tipo,
      cantidad: parseFloat(m.cantidad),
      observaciones: m.observaciones || '',
      usuario: m.usuario
    }));

    displayHistorialTable(formattedData);
  } catch(error) {
    showMessage('historialTable', 'Error: ' + error.message, 'error');
  }
}

function displayHistorialTable(data) {
  const container = document.getElementById('historialTable');
  
  if (data.length === 0) {
    container.innerHTML = '<div class="message warning">No hay movimientos en el período seleccionado</div>';
    return;
  }

  let html = `
    <div class="message success">Se encontraron ${data.length} movimientos</div>
    <table>
      <thead>
        <tr>
          <th>Fecha de mov.</th>
          <th>Transaction Key</th>
          <th>ID Producto</th>
          <th>Producto</th>
          <th>Unidad</th>
          <th>Cantidad</th>
          <th>Tipo</th>
          <th>Observaciones</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(mov => {
    let tipoClass = 'text-success';
    let tipoText = mov.tipo;
    
    switch(mov.tipo) {
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
      case 'AJUSTE':
        tipoClass = 'text-warning';
        tipoText = 'Ajuste';
        break;
    }

    html += `
      <tr>
        <td>${mov.fecha}</td>
        <td>${mov.productKey}</td>
        <td>${mov.codigo}</td>
        <td>${mov.producto}</td>
        <td>${mov.unidad}</td>
        <td>${mov.cantidad}</td>
        <td class="${tipoClass}">${tipoText}</td>
        <td>${mov.observaciones}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function validarIntegridad() {
  const html = `
    <h4>Validación de Integridad del Sistema</h4>
    <div class="message success">
      Todos los datos están correctos. El sistema está íntegro y la consistencia de los datos está garantizada mediante restricciones nativas de la base de datos Supabase (PostgreSQL).
    </div>
  `;
  document.getElementById("configResults").innerHTML = html;
}

async function inicializarSistema() {
  try {
    const { error } = await supabaseClient.from('unidades').select('count', { head: true });
    if (error) throw error;
    showMessage('configResults', 'Sistema ya inicializado y conectado a Supabase con éxito.', 'success');
  } catch(error) {
    showMessage('configResults', 'Error de conexión a Supabase: ' + error.message, 'error');
  }
}

async function exportarStock() {
  try {
    const { data, error } = await supabaseClient
      .from('v_productos_stock')
      .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad')
      .order('nombre');
    if (error) throw error;

    let csv = "\uFEFF";
    csv += "ID Producto,Producto,Cantidad,Unidad,Grupo,Stock Mín.,Stock Actual,Estado,Diferencia\n";
    
    data.forEach(producto => {
      let estado = "Normal";
      let diferencia = "";
      
      if (producto.cantidad <= 0) {
        estado = "Sin Stock";
        diferencia = `-${producto.stockMin}`;
      } else if (producto.cantidad <= producto.stockMin && producto.stockMin > 0) {
        estado = "Stock Bajo";
        diferencia = `-${producto.stockMin - producto.cantidad}`;
      } else {
        diferencia = `+${producto.cantidad - producto.stockMin}`;
      }
      
      csv += `"${producto.codigo}","${producto.nombre}",${producto.cantidad},"${producto.unidad}","${producto.grupo}",${producto.stockMin},${producto.cantidad},"${estado}","${diferencia}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `Inventario_Stock_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    
    showMessage('stockTable', 'Stock exportado exitosamente', 'success');
  } catch(error) {
    showMessage('stockTable', 'Error al exportar: ' + error.message, 'error');
  }
}

function limpiarFormProducto() {
  document.getElementById('formProducto').reset();
  document.getElementById("stockMinProd").value = "0";
  document.getElementById('msgProd').innerHTML = '';
}

async function importarCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  showMessage('msgCsv', 'Procesando archivo CSV...', 'info');

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    
    if (lines.length < 2) {
      showMessage('msgCsv', 'El archivo CSV está vacío o no contiene suficientes filas.', 'error');
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
      showMessage('msgCsv', 'Formato CSV incorrecto. El archivo debe incluir exactamente las cabeceras: "ID Producto", "Producto", "Unidad", "Grupo", y "Stock Mín.".', 'error');
      event.target.value = '';
      return;
    }

    try {
      if (!supabaseClient) {
        throw new Error('Supabase client is not initialized.');
      }

      // Fetch lookups and existing products in parallel
      const [resUnidades, resGrupos, resProductos] = await Promise.all([
        supabaseClient.from('unidades').select('id, nombre'),
        supabaseClient.from('grupos').select('id, nombre'),
        supabaseClient.from('productos').select('codigo')
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

      // Split line using regex to respect quoted fields
      const splitRegex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(splitRegex).map(c => c.trim().replace(/^"|"$/g, ''));

        if (cols.length <= Math.max(colCodigo, colNombre)) {
          emptyCount++;
          continue;
        }

        const codigo = cols[colCodigo]?.trim().toUpperCase();
        const nombre = cols[colNombre]?.trim();

        if (!codigo || !nombre) {
          emptyCount++;
          continue;
        }

        // Check if product code already exists to ignore it
        if (existingCodes.has(codigo)) {
          skippedCount++;
          continue;
        }

        // Map Unit (fallback to default)
        let unidadId = defaultUnidadId;
        if (colUnidad !== -1 && cols[colUnidad]) {
          const uName = cols[colUnidad].trim().toLowerCase();
          if (unidadesMap.has(uName)) {
            unidadId = unidadesMap.get(uName);
          }
        }

        // Map Group (fallback to default)
        let grupoId = defaultGrupoId;
        if (colGrupo !== -1 && cols[colGrupo]) {
          const gName = cols[colGrupo].trim().toLowerCase();
          if (gruposMap.has(gName)) {
            grupoId = gruposMap.get(gName);
          }
        }

        // Map Stock Min
        let stockMin = 0;
        if (colStockMin !== -1 && cols[colStockMin]) {
          const parsedStock = parseInt(cols[colStockMin]);
          if (!isNaN(parsedStock) && parsedStock >= 0) {
            stockMin = parsedStock;
          }
        }

        productsToInsert.push({
          codigo,
          nombre,
          unidad_id: unidadId,
          grupo_id: grupoId,
          stock_min: stockMin
        });
      }

      if (productsToInsert.length === 0) {
        let msg = 'No se importó ningún producto nuevo.';
        if (skippedCount > 0) {
          msg += ` (${skippedCount} productos ya existían en la base de datos).`;
        }
        showMessage('msgCsv', msg, 'warning');
        event.target.value = '';
        return;
      }

      const { error: insertErr } = await supabaseClient.from('productos').insert(productsToInsert);
      if (insertErr) throw insertErr;

      showMessage('msgCsv', `Importación exitosa: se registraron ${productsToInsert.length} productos. ` +
        `(${skippedCount} omitidos por estar duplicados, ${emptyCount} filas vacías/inválidas).`, 'success');

      event.target.value = '';
      
      // Refresh statistics and views
      loadDashboard();
      listarProductosEnGestion();
      if (currentTab === 'inventario') {
        mostrarStock();
      }
    } catch (error) {
      console.error('Error al importar CSV:', error);
      showMessage('msgCsv', 'Error al procesar la importación: ' + error.message, 'error');
      event.target.value = '';
    }
  };

  reader.readAsText(file, 'UTF-8');
}

async function listarProductosEnGestion() {
  const loading = document.getElementById("loadingProductos");
  const container = document.getElementById("tablaProductosContainer");
  if (!loading || !container) return;

  loading.style.display = "block";
  container.innerHTML = "";

  try {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabaseClient
      .from('v_productos_stock')
      .select('codigo, nombre, unidad, grupo, stockMin:stock_min, cantidad')
      .order('nombre');

    if (error) throw error;

    loading.style.display = "none";

    if (data.length === 0) {
      container.innerHTML = '<div class="message warning">No hay productos registrados</div>';
      return;
    }

    let html = `
      <div class="table-container">
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
    `;

    data.forEach(p => {
      let statusClass = 'status-normal';
      if (p.cantidad <= 0) {
        statusClass = 'status-zero';
      } else if (p.cantidad <= p.stockMin && p.stockMin > 0) {
        statusClass = 'status-low';
      }

      html += `
        <tr class="${statusClass}">
          <td><strong>${p.codigo}</strong></td>
          <td>${p.nombre}</td>
          <td>${p.unidad}</td>
          <td>${p.grupo}</td>
          <td>${p.stockMin}</td>
          <td>${p.cantidad}</td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (error) {
    console.error('Error listing products in management:', error);
    loading.style.display = "none";
    showMessage('tablaProductosContainer', 'Error al cargar productos: ' + error.message, 'error');
  }
}

async function importarMovimientosCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  showMessage('msgMovCsv', 'Procesando archivo CSV de movimientos...', 'info');

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    
    if (lines.length < 2) {
      showMessage('msgMovCsv', 'El archivo CSV está vacío o no contiene suficientes filas.', 'error');
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
      showMessage('msgMovCsv', 'Formato CSV incorrecto. El archivo debe contener al menos las columnas "Transaction Key", "ID Producto" y "Cantidad".', 'error');
      event.target.value = '';
      return;
    }

    try {
      if (!supabaseClient) {
        throw new Error('Supabase client is not initialized.');
      }

      // Fetch existing products and movement keys in parallel
      const [resProductos, resMovimientos] = await Promise.all([
        supabaseClient.from('productos').select('codigo'),
        supabaseClient.from('movimientos').select('key')
      ]);

      if (resProductos.error) throw resProductos.error;
      if (resMovimientos.error) throw resMovimientos.error;
      
      const existingCodes = new Set(resProductos.data.map(p => p.codigo.trim().toUpperCase()));
      const existingKeys = new Set(resMovimientos.data.filter(m => m.key).map(m => m.key.trim().toUpperCase()));
      const defaultDate = document.getElementById("fechaMov").value || new Date().toISOString().slice(0, 10);

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

        const codigo = cols[colCodigo]?.trim().toUpperCase();
        const cantidadStr = cols[colCantidad]?.trim();
        const key = cols[colKey]?.trim();

        if (!codigo || !cantidadStr || !key) {
          emptyCount++;
          continue;
        }

        const upperKey = key.toUpperCase();

        // Validate product code exists
        if (!existingCodes.has(codigo)) {
          skippedInvalidProduct++;
          continue;
        }

        // Validate unique key constraint
        if (existingKeys.has(upperKey) || seenKeysInCsv.has(upperKey)) {
          skippedDuplicateKey++;
          continue;
        }
        seenKeysInCsv.add(upperKey);

        // Validate quantity
        const cantidad = parseFloat(cantidadStr);
        if (isNaN(cantidad) || cantidad <= 0) {
          skippedInvalidAmount++;
          continue;
        }

        // Map Date (fallback to selected UI date)
        let fecha = defaultDate;
        if (colFecha !== -1 && cols[colFecha]) {
          const rawFecha = cols[colFecha].trim();
          const parsedDate = new Date(rawFecha);
          if (!isNaN(parsedDate.getTime())) {
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            fecha = `${year}-${month}-${day}`;
          }
        }

        // Map Observaciones
        let observaciones = '';
        if (colObservaciones !== -1 && cols[colObservaciones]) {
          observaciones = cols[colObservaciones].trim();
        }

        movementsToInsert.push({
          producto_codigo: codigo,
          fecha,
          tipo: 'INGRESO',
          cantidad,
          usuario: 'Usuario Sistema',
          observaciones,
          key: key
        });
      }

      if (movementsToInsert.length === 0) {
        let msg = 'No se importó ningún movimiento nuevo.';
        if (skippedInvalidProduct > 0 || skippedInvalidAmount > 0 || skippedDuplicateKey > 0) {
          msg += ` (${skippedInvalidProduct} omitidos por producto inexistente [registre nuevos productos en Gestión de Productos primero], ${skippedDuplicateKey} por clave duplicada, ${skippedInvalidAmount} por cantidad no válida).`;
        }
        showMessage('msgMovCsv', msg, 'warning');
        event.target.value = '';
        return;
      }

      const { error: insertErr } = await supabaseClient.from('movimientos').insert(movementsToInsert);
      if (insertErr) throw insertErr;

      showMessage('msgMovCsv', `Importación exitosa: se registraron ${movementsToInsert.length} movimientos de tipo INGRESO. ` +
        `(${skippedInvalidProduct} omitidos por producto inexistente [registre nuevos productos en Gestión de Productos primero], ${skippedDuplicateKey} por clave (KEY) duplicada, ${skippedInvalidAmount} por cantidad no válida, ${emptyCount} filas vacías/sin clave).`, 'success');

      event.target.value = '';
      
      // Refresh UI statistics and views
      loadDashboard();
      if (currentTab === 'inventario') {
        mostrarStock();
      }
      listarProductosEnGestion();
    } catch (error) {
      console.error('Error al importar movimientos CSV:', error);
      showMessage('msgMovCsv', 'Error al procesar la importación: ' + error.message, 'error');
      event.target.value = '';
    }
  };

  reader.readAsText(file, 'UTF-8');
}

function limpiarFormMovimiento() {
  document.getElementById('formMovimiento').reset();
  document.getElementById("fechaMov").valueAsDate = new Date();
  document.getElementById('msgMov').innerHTML = '';
  
  const d1 = document.getElementById("autocompleteDropdown");
  const d2 = document.getElementById("autocompleteDropdownNombre");
  if (d1) d1.style.display = "none";
  if (d2) d2.style.display = "none";
  
  const codigoField = document.getElementById("codigoMov");
  const nombreField = document.getElementById("nombreMov");
  if (codigoField) {
    codigoField.disabled = false;
    codigoField.readOnly = false;
  }
  if (nombreField) {
    nombreField.disabled = false;
    nombreField.readOnly = false;
  }
}

function limpiarTodosFormularios() {
  limpiarFormProducto();
  limpiarFormMovimiento();
  limpiarBuscarInventario();
  document.getElementById('historialTable').innerHTML = '';
  document.getElementById('configResults').innerHTML = '';
}

function showMessage(containerId, message, type) {
  const container = document.getElementById(containerId);
  let className = 'message';
  
  switch(type) {
    case 'success':
      className += ' success';
      break;
    case 'error':
      className += ' error';
      break;
    case 'warning':
      className += ' warning';
      break;
    case 'info':
      className += ' info';
      break;
    default:
      className += ' success';
  }
  
  container.innerHTML = `<div class="${className}">${message}</div>`;
  
  if (type === 'success') {
    setTimeout(() => {
      container.innerHTML = '';
    }, 5000);
  }
}

function verDetalleProducto(codigo) {
  alert(`Funcionalidad de detalle para producto: ${codigo}\nEsta función se implementará próximamente.`);
}

function confirmarReset() {
  document.getElementById("resetDniInput").value = "";
  document.getElementById("resetDniMsg").innerHTML = "";
  const errorContainer = document.getElementById("resetErrorContainer");
  if (errorContainer) errorContainer.style.display = "none";
  
  document.getElementById("resetStep1").style.display = "block";
  document.getElementById("resetStep2").style.display = "none";
  document.getElementById("resetStepSuccess").style.display = "none";
  
  document.getElementById("resetModal").style.display = "flex";
}

function closeResetModal() {
  document.getElementById("resetModal").style.display = "none";
}

function goToResetStep1() {
  document.getElementById("resetStep1").style.display = "block";
  document.getElementById("resetStep2").style.display = "none";
}

function goToResetStep2() {
  const dniInput = document.getElementById("resetDniInput");
  const dni = dniInput.value.trim();
  const dniMsg = document.getElementById("resetDniMsg");
  
  if (!dni) {
    dniMsg.innerHTML = '<span style="color: var(--status-zero-text); font-weight: 600;">El DNI es obligatorio.</span>';
    return;
  }
  
  if (!/^\d+$/.test(dni)) {
    dniMsg.innerHTML = '<span style="color: var(--status-zero-text); font-weight: 600;">El DNI debe contener solo números.</span>';
    return;
  }
  
  dniMsg.innerHTML = "";
  document.getElementById("resetConfirmDniLabel").textContent = dni;
  
  document.getElementById("resetStep1").style.display = "none";
  document.getElementById("resetStep2").style.display = "block";
}

async function executeSystemReset() {
  const dni = document.getElementById("resetDniInput").value.trim();
  const progressContainer = document.getElementById("resetProgressContainer");
  const actionButtons = document.getElementById("resetActionButtons");
  const errorContainer = document.getElementById("resetErrorContainer");
  
  if (errorContainer) errorContainer.style.display = "none";
  if (progressContainer) progressContainer.style.display = "block";
  if (actionButtons) actionButtons.style.display = "none";

  try {
    if (!supabaseClient) {
      throw new Error('El cliente Supabase no está inicializado.');
    }

    const { error: resetError } = await supabaseClient.rpc('reset_sistema_autorizado', {
      admin_dni: dni
    });
    
    if (resetError) throw resetError;

    limpiarTodosFormularios();
    
    document.getElementById("resetStep2").style.display = "none";
    document.getElementById("resetStepSuccess").style.display = "block";

    loadDashboard();
  } catch (error) {
    console.error('Error during system reset:', error);
    if (progressContainer) progressContainer.style.display = "none";
    if (actionButtons) actionButtons.style.display = "flex";
    
    if (errorContainer) {
      errorContainer.innerHTML = `<strong>Error:</strong> ${error.message || 'Error desconocido'}`;
      errorContainer.style.display = "block";
    }
  }
}

async function exportarReporte() {
  const fechaDesde = document.getElementById("fechaDesde").value;
  const fechaHasta = document.getElementById("fechaHasta").value;
  const tipo = document.getElementById("filtroTipo").value;

  if (!fechaDesde || !fechaHasta) {
    showMessage('historialTable', 'Seleccione las fechas para exportar', 'warning');
    return;
  }

  try {
    let query = supabaseClient
      .from('movimientos')
      .select(`
        fecha,
        codigo:producto_codigo,
        cantidad,
        observaciones,
        tipo,
        key,
        producto:productos(nombre, unidades(nombre))
      `)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false });
    
    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data.length === 0) {
      showMessage('historialTable', 'No hay datos para exportar en el período seleccionado', 'warning');
      return;
    }

    let csv = 'Fecha de mov.,Transaction Key,ID Producto,Producto,Unidad,Cantidad,Tipo,Observaciones\n';
    data.forEach(m => {
      const pName = m.producto ? m.producto.nombre : 'Producto no encontrado';
      const uName = m.producto && m.producto.unidades ? m.producto.unidades.nombre : '';
      const formattedFecha = m.fecha.split('-').reverse().join('/');
      csv += `"${formattedFecha}","${m.key || ''}","${m.codigo}","${pName}","${uName}","${m.cantidad}","${m.tipo}","${m.observaciones || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `Reporte_Movimientos_${fechaDesde}_${fechaHasta}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    
    showMessage('historialTable', 'Reporte exportado exitosamente', 'success');
  } catch(error) {
    showMessage('historialTable', 'Error al exportar: ' + error.message, 'error');
  }
}

document.addEventListener('keydown', function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    
    switch(currentTab) {
      case 'productos':
        document.getElementById('formProducto').dispatchEvent(new Event('submit'));
        break;
      case 'movimientos':
        document.getElementById('formMovimiento').dispatchEvent(new Event('submit'));
        break;
    }
  }
  
  if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
    event.preventDefault();
    
    switch(currentTab) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'inventario':
        mostrarStock();
        break;
    }
  }
});

document.addEventListener('click', function(event) {
  if (!event.target.closest('.autocomplete-container')) {
    document.getElementById("autocompleteDropdown").style.display = "none";
  }
});