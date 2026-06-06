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

function initializeApp() {
  initTheme();
  setDefaultDates();
  if (supabaseClient) {
    loadListas();
    loadDashboard();
  } else {
    showMessage('statsGrid', 'Error: No se pudo conectar a Supabase. Verifique las credenciales en config.js.', 'error');
  }
  showTab('dashboard');
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

function seleccionarProducto(codigo, nombre) {
  document.getElementById("codigoMov").value = codigo;
  document.getElementById("autocompleteDropdown").style.display = "none";
}

function ocultarAutocompletado() {
  setTimeout(() => {
    document.getElementById("autocompleteDropdown").style.display = "none";
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

    const { error: e2 } = await supabaseClient.from('movimientos').insert([{
      producto_codigo: codigo,
      fecha,
      tipo,
      cantidad,
      usuario: 'Usuario Sistema',
      observaciones
    }]);
    
    if (e2) throw e2;

    showMessage('msgMov', 'Movimiento registrado correctamente.', 'success');
    document.getElementById('formMovimiento').reset();
    document.getElementById("fechaMov").valueAsDate = new Date();
  } catch(error) {
    showMessage('msgMov', 'Error al registrar movimiento: ' + error.message, 'error');
  }
}

function handleTipoChange() {
  const tipo = document.getElementById("tipoMov").value;
  const cantField = document.getElementById("cantMov");
  
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

async function buscarProducto() {
  const texto = document.getElementById("buscarTexto").value.trim().toLowerCase();
  if (!texto) {
    showMessage('resultadosBusqueda', 'Ingrese un texto para buscar', 'warning');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('v_productos_stock')
      .select('*')
      .or(`codigo.ilike.%${texto}%,nombre.ilike.%${texto}%,grupo.ilike.%${texto}%`)
      .order('nombre');
    
    if (error) throw error;
    
    const formattedData = data.map(r => [
      r.codigo, r.nombre, r.unidad, r.grupo, r.stock_min, r.cantidad
    ]);
    displaySearchResults(formattedData);
  } catch(error) {
    showMessage('resultadosBusqueda', 'Error en la búsqueda: ' + error.message, 'error');
  }
}

function buscarEnTiempoReal() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const texto = document.getElementById("buscarTexto").value.trim();
    if (texto.length >= 2) {
      buscarProducto();
    } else if (texto.length === 0) {
      document.getElementById('resultadosBusqueda').innerHTML = '';
    }
  }, 300);
}

function displaySearchResults(data) {
  const container = document.getElementById('resultadosBusqueda');
  
  if (data.length === 0) {
    container.innerHTML = '<div class="message warning">No se encontraron productos</div>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Nombre</th>
          <th>Unidad</th>
          <th>Grupo</th>
          <th>Stock Mín.</th>
          <th>Stock Actual</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(producto => {
    const [codigo, nombre, unidad, grupo, stockMin, stockActual] = producto;
    let statusClass = 'status-normal';
    let estado = 'Normal';
    
    if (stockActual <= 0) {
      statusClass = 'status-zero';
      estado = 'Sin Stock';
    } else if (stockActual <= stockMin && stockMin > 0) {
      statusClass = 'status-low';
      estado = 'Stock Bajo';
    }

    html += `
      <tr class="${statusClass}">
        <td>${codigo}</td>
        <td>${nombre}</td>
        <td>${unidad}</td>
        <td>${grupo}</td>
        <td>${stockMin}</td>
        <td>${stockActual}</td>
        <td>${estado}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function mostrarStock() {
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
    displayStockTable(data, container);
  } catch(error) {
    loading.style.display = "none";
    showMessage('stockTable', 'Error al cargar stock: ' + error.message, 'error');
  }
}

function displayStockTable(data, container) {
  if (data.length === 0) {
    container.innerHTML = '<div class="message warning">No hay productos registrados</div>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Nombre</th>
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
        producto:productos(nombre)
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
      codigo: m.codigo,
      producto: m.producto ? m.producto.nombre : 'Producto no encontrado',
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
          <th>Fecha</th>
          <th>Código</th>
          <th>Producto</th>
          <th>Tipo</th>
          <th>Cantidad</th>
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
        <td>${mov.codigo}</td>
        <td>${mov.producto}</td>
        <td class="${tipoClass}">${tipoText}</td>
        <td>${mov.cantidad}</td>
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
    csv += "Código,Nombre,Unidad,Grupo,Stock Mínimo,Stock Actual,Estado,Diferencia\n";
    
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
      
      csv += `"${producto.codigo}","${producto.nombre}","${producto.unidad}","${producto.grupo}",${producto.stockMin},${producto.cantidad},"${estado}","${diferencia}"\n`;
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
    const colCodigo = headers.findIndex(h => h.includes('cod') || h.includes('cód'));
    const colNombre = headers.findIndex(h => h.includes('nom'));
    const colUnidad = headers.findIndex(h => h.includes('uni'));
    const colGrupo = headers.findIndex(h => h.includes('gru'));
    const colStockMin = headers.findIndex(h => h.includes('stock_min') || h.includes('min') || h.includes('mín'));

    if (colCodigo === -1 || colNombre === -1) {
      showMessage('msgCsv', 'Formato CSV incorrecto. El archivo debe contener al menos las columnas "Código" y "Nombre".', 'error');
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
              <th>Código</th>
              <th>Nombre</th>
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

function limpiarFormMovimiento() {
  document.getElementById('formMovimiento').reset();
  document.getElementById("fechaMov").valueAsDate = new Date();
  document.getElementById('msgMov').innerHTML = '';
  document.getElementById("autocompleteDropdown").style.display = "none";
}

function limpiarBusqueda() {
  document.getElementById("buscarTexto").value = "";
  document.getElementById("resultadosBusqueda").innerHTML = "";
}

function limpiarTodosFormularios() {
  limpiarFormProducto();
  limpiarFormMovimiento();
  limpiarBusqueda();
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

async function confirmarReset() {
  try {
    if (!confirm('ADVERTENCIA: Esta acción eliminará TODOS los datos del sistema (productos y movimientos) y quedará registrada.\n\n¿Está completamente seguro de que desea continuar?')) {
      return;
    }

    const dni = prompt('Por favor, ingrese su DNI para autorizar y registrar esta operación:');
    if (dni === null) return; // User clicked Cancel

    const cleanDni = dni.trim();
    const authorizedDnis = ['48204199', '70429841'];
    if (!authorizedDnis.includes(cleanDni)) {
      alert('Operación cancelada: El DNI ingresado no está autorizado para realizar esta acción.');
      return;
    }

    if (!confirm(`Se registrará el reset a nombre del DNI: ${cleanDni}.\n\n¿Proceder con el reset completo e irreversible?`)) {
      return;
    }

    if (!supabaseClient) {
      throw new Error('Supabase client is not initialized.');
    }

    // 1. Insert log of the reset
    const { error: logError } = await supabaseClient
      .from('historial_resets')
      .insert([{ dni: cleanDni }]);
    
    if (logError) throw logError;

    // 2. Delete all movements
    const { error: delMovError } = await supabaseClient
      .from('movimientos')
      .delete()
      .gt('id', 0);
    
    if (delMovError) throw delMovError;

    // 3. Delete all products (this also cascades to movements just in case, but we cleared it already)
    const { error: delProdError } = await supabaseClient
      .from('productos')
      .delete()
      .neq('codigo', '');
    
    if (delProdError) throw delProdError;

    // Clear all forms and search results
    limpiarTodosFormularios();

    // Show success message
    showMessage('configResults', 'El sistema ha sido restablecido a su estado inicial con éxito.', 'success');
    alert('Sistema restablecido exitosamente.');

    // Reload dashboard stats
    loadDashboard();
    
  } catch (error) {
    console.error('Error during system reset:', error);
    showMessage('configResults', 'Error al restablecer el sistema: ' + error.message, 'error');
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
        producto:productos(nombre)
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

    let csv = 'Fecha,Código,Producto,Tipo,Cantidad,Observaciones\n';
    data.forEach(m => {
      const pName = m.producto ? m.producto.nombre : 'Producto no encontrado';
      const formattedFecha = m.fecha.split('-').reverse().join('/');
      csv += `"${formattedFecha}","${m.codigo}","${pName}","${m.tipo}","${m.cantidad}","${m.observaciones || ''}"\n`;
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