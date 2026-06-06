# Technical JSDoc Documentation

This document contains JSDoc-style documentation for the functions implemented in **Project Inventario** (including [code.js](file:///c:/Users/Marco%20Villafuerte/Desktop/Project_Inventario/code.js) and [indeX.html](file:///c:/Users/Marco%20Villafuerte/Desktop/Project_Inventario/indeX.html)).



---

## 🖥️ Backend Functions (`code.js` / Google Apps Script)

These functions execute on Google's servers and interface directly with the Google Sheets database and Google Drive.

### 🔌 Entry Point
#### `doGet()`
* **Description:** Serves the web app UI using Google's HTML Service.
* **Returns:** `HtmlService.HtmlOutput` - The rendered page from `index.html` with title and X-Frame Options configured.



---

### 📦 Product Management
#### `registrarProducto(producto)`
* **Description:** Registers a new product in the `Productos` sheet after validation.
* **Parameters:**
  * `producto` `{Object}` - The product data.
  * `producto.codigo` `{string}` - Unique code identifier.
  * `producto.nombre` `{string}` - Display name of the product.
  * `producto.unidad` `{string}` - Measurement unit (defaults to "Unidades").
  * `producto.grupo` `{string}` - Category/Group (defaults to "General").
  * `producto.stockMin` `{number|string}` - Minimum threshold for stock warnings.
* **Returns:** `string` - Status message indicating success or the specific validation error.

#### `buscarProductoPorCodigo(codigo)`
* **Description:** Searches for products by matching the prefix of their code.
* **Parameters:**
  * `codigo` `{string}` - The search query prefix.
* **Returns:** `Array<Object>` - List of up to 10 matching products containing `codigo`, `nombre`, `unidad`, and `grupo`.

#### `buscarProducto(texto)`
* **Description:** Searches for products matching a substring in their code, name, or group, including their current stock.
* **Parameters:**
  * `texto` `{string}` - The search query text.
* **Returns:** `Array<Array>` - List of matching rows sorted alphabetically by name. Each row contains: `[codigo, nombre, unidad, grupo, stockMin, stockActual]`.



---

### 📈 Stock & Transactions
#### `registrarMovimiento(mov)`
* **Description:** Records a stock transaction (ingress, egress, adjustments) in the ledger. Verifies that there is sufficient stock before allowing withdrawals.
* **Parameters:**
  * `mov` `{Object}` - The transaction data.
  * `mov.codigo` `{string}` - The product code.
  * `mov.fecha` `{string|Date}` - Transaction date.
  * `mov.tipo` `{string}` - Movement type: `"INGRESO"`, `"SALIDA"`, `"AJUSTE_POSITIVO"`, `"AJUSTE_NEGATIVO"`, or `"AJUSTE"`.
  * `mov.cantidad` `{number|string}` - Amount to adjust.
  * `mov.observaciones` `{string}` - (Optional) Additional notes.
* **Returns:** `string` - Status message indicating success or the reason for failure (e.g. "Stock insuficiente").

#### `(codigo)`
* **Description:** Aggregates all transactions in the ledger for a specific product code to calculate its current stock.
* **Parameters:**
  * `codigo` `{string}` - The unique product code.
* **Returns:** `number` - The net stock balance (minimum `0`).

#### `obtenerStock()`
* **Description:** Retrieves all registered products along with their real-time calculated stock.
* **Returns:** `Array<Object>` - Array of products sorted by name, containing: `codigo`, `nombre`, `unidad`, `grupo`, `stockMin`, and `cantidad` (current stock).



---

### 📊 Reports & Analysis
#### `obtenerHistorial(filtros)`
* **Description:** Filters the ledger of movements based on date ranges and transaction type.
* **Parameters:**
  * `filtros` `{Object}` - Filtering criteria.
  * `filtros.fechaDesde` `{string}` - ISO Date string `YYYY-MM-DD` (Start date).
  * `filtros.fechaHasta` `{string}` - ISO Date string `YYYY-MM-DD` (End date).
  * `filtros.tipo` `{string}` - Specific movement type filter (empty for all).
* **Returns:** `Array<Object>` - List of matching movements sorted chronologically (latest first).

#### `obtenerResumen()`
* **Description:** Generates high-level metrics for the dashboard.
* **Returns:** `Object` - Statistics object:
  * `.totalProductos` `{number}` - Total unique products.
  * `.totalMovimientos` `{number}` - Total recorded transactions.
  * `.sinStock` `{number}` - Count of out-of-stock items.
  * `.stockBajo` `{number}` - Count of items below their minimum stock threshold.
  * `.valorTotalInventario` `{number}` - Aggregate sum of stock quantities.
  * `.movimientosUltimoMes` `{number}` - Count of actions in the past 30 days.



---

### ⚙️ System Configuration & Utilities
#### `validarIntegridad()`
* **Description:** Runs database checks for structural anomalies (missing sheets, duplicate codes, invalid names/quantities, negative stock balances).
* **Returns:** `Object` - Report containing `.errores` `{Array<string>}`.

#### `obtenerListas()`
* **Description:** Loads default values for Units and Groups dropdowns, initializing them in Google Sheets if they don't exist.
* **Returns:** `Object` - Contains `.unidades` `{Array<string>}` and `.grupos` `{Array<string>}` lists.

#### `exportarStockCSV()`
* **Description:** Compiles the current stock list into a CSV format, uploads it to Google Drive in the folder "Reportes Inventario", and returns its sharing URL.
* **Returns:** `string|null` - The sharing URL of the generated Google Drive file, or `null` if failure.

#### `inicializarHojas()`
* **Description:** Structural initializer that creates missing spreadsheets and injects the header schemas with formatting.
* **Returns:** `string` - Execution report.

#### `getTipoMovimientoTexto(tipo)`
* **Description:** Translates internal enum movement keys to Spanish readable labels.
* **Parameters:**
  * `tipo` `{string}` - The type enum.
* **Returns:** `string` - Spanish description label.

#### `formatearFecha(fecha)`
* **Description:** Converts dates to `dd/MM/yyyy` format aligned to the script timezone.
* **Parameters:**
  * `fecha` `{Date|string|number}` - Date to format.
* **Returns:** `string` - Formatted date string.



---

## 🌐 Frontend Functions (`indeX.html`)

These functions run inside the user's web browser, managing DOM rendering and interacting with Google Apps Script backend.

### 🔄 Lifecycle & Tabs
* `initializeApp()` - Invoked on load; sets default dates, fetches list dropdowns, and triggers the dashboard load.
* `setDefaultDates()` - Sets date range pickers to default to a 1-month range and sets today's date on the transaction page.
* `showTab(tabName)` - Switches active workspace tab, sets styling for the sidebar, and updates specific tab components.

### 📦 Forms & Actions
* `registrarProducto(event)` - Collects product form inputs, sends them to the backend, alerts users of results, and resets inputs on success.
* `registrarMovimiento(event)` - Handles transaction creation and updates client forms on success.
* `handleTipoChange()` - Dynamic placeholder helper that shifts instructions on input bounds depending on whether user selects entry/exit.

### 🔍 Auto-Complete Search
* `buscarProductoAutocompletado()` - Implements input key debounce (200ms) to trigger prefix lookup queries for stock operations.
* `mostrarAutocompletado(productos)` - Updates and opens a dropdown relative to the active input with matching search suggestions.
* `seleccionarProducto(codigo, nombre)` - Event callback that auto-populates inputs when selecting items from the dropdown list.
* `ocultarAutocompletado()` - Timer-wrapped closing handler to prevent dropdown dismissal before click coordinates trigger selection.

### 📊 Render Engines
* `loadDashboard()` - Pulls statistics and populates key indicator cards on the home panel.
* `buscarProducto()` - Submits and renders results in real-time query list.
* `buscarEnTiempoReal()` - Triggers lookup requests when user changes text query (debounced 300ms, minimum 2 characters).
* `displaySearchResults(data)` - Standard HTML table builder for custom product lookups.
* `mostrarStock()` - Refreshes core stock layout with loader indicators.
* `displayStockTable(data, container)` - Table engine that builds and tags stock levels with visual statuses (`status-normal`, `status-low`, `status-zero`).
* `mostrarAlertas()` - Filters lists on client-side to output warning products only.
* `showStockAlerts()` - Renders details of items requiring immediate attention onto the main dashboard.
* `mostrarHistorial()` - Generates transactional ledger history.
* `displayHistorialTable(data)` - Table builder displaying transactions and color-coding positive/negative ledger adjustments.

### ⚙️ Utilities & Exports
* `validarIntegridad()` - Contacts administrative validator and appends structural warnings into the config tab.
* `inicializarSistema()` - Requests sheet rebuild/initialization setup.
* `exportarStock()` - Commands CSV compiler and triggers automatic Google Drive downloads on the browser client.
* `exportarReporte()` - Compiles historical transaction records client-side into a downloadable CSV blob directly from browser memory.
* `showMessage(containerId, message, type)` - Renders colored toast notifications (`success`, `error`, `warning`, `info`) with auto-dismiss (5 seconds for success).
* `verDetalleProducto(codigo)` - Placeholder detail view handler.
* `confirmarReset()` - Asynchronous security-checked system reset operation that requires entering a valid 8-digit numeric DNI, logs the user's authorization to Supabase, and clears the movements and products tables.
* `limpiarFormProducto()` / `limpiarFormMovimiento()` / `limpiarBusqueda()` / `limpiarTodosFormularios()` - Forms and status cleaning helpers.
