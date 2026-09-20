# Specification: Soldaduras and Pozos a Tierra dashboards

## 1. Objective

Add two independent operational dashboards to the current project:

1. **Soldaduras**
2. **Pozos a Tierra**

They must provide the same working experience as PAT (filters, summary cards, charts, timeline, detail drawer, Excel import and export) without using cable-specific storage or meter-based terminology.

**Out of scope for version 1:** warehouse dispatches, VALE, RECEPCIÓN, dispatch history and cable-length calculations.

## 2. Architectural decisions

- Create separate root tables: `soldaduras` and `pozos_tierra`.
- Do not store either activity in `cable_schedule`: its columns and rules describe cable runs and metres, which would make the data and reports misleading.
- Both tables use the existing `project_area_id` relationship. Área Seca and Área Húmeda remain rows in the same table, protected by the existing area-aware permissions. Physical PostgreSQL table partitioning is not needed for the expected scale.
- Each record has its own immutable UUID `id`. The business tag/code is also required and unique within its module and project area.
- Quantities are measured in **UND**, not metres. Use generic field names (`cantidad_ot`, `cantidad_ejecutada`) so both modules can be reported consistently.
- Historical progress must be stored as events, not inferred from a final field. This keeps the production-over-time chart accurate when execution is updated in parts.

## 3. Database design

### 3.1 Shared fields in `soldaduras` and `pozos_tierra`

| Field | Type | Rule / purpose |
| --- | --- | --- |
| `id` | UUID | Primary key; immutable internal identifier. |
| `project_area_id` | UUID | Required FK to `project_areas`; determines Área Seca or Área Húmeda. |
| `codigo_unico` | text | Required business identifier; unique per module and area. |
| `wbs` | text | Required WBS code. |
| `sistema` | text | Required system name. |
| `plano` | text | Optional drawing reference. |
| `tipo` | text | Required category/type. |
| `descripcion` | text | Optional operational description. |
| `cantidad_ot` | numeric(12,2) | Planned quantity; non-negative. |
| `cantidad_ejecutada` | numeric(12,2) | Current executed quantity; non-negative. |
| `fecha_ejecucion` | date | Latest execution date; optional until progress exists. |
| `estado` | text | Derived or validated status: Pendiente, En proceso, Completado. |
| `created_at`, `updated_at` | timestamptz | Audit timestamps. |
| `created_by`, `updated_by` | UUID | References the authenticated user responsible for the record/change. |

Constraints:

- `cantidad_ejecutada <= cantidad_ot` by default. An explicit admin/supervisor exception can be introduced later if over-execution must be recorded.
- The database, not only the browser, must validate required values, valid area access and unique business codes.
- A trigger calculates `estado`: 0 = Pendiente, between 0 and planned = En proceso, planned or greater = Completado.

### 3.2 Module-specific fields

The first migration will keep only universally confirmed fields above. The following fields are reserved until their source Excel confirms their meaning:

**Soldaduras**

- `tipo_soldadura` (for examples such as GT, T 4/0, T 4/0–2/0, X 4/0)
- `material_principal` (optional)
- `ubicacion` (optional)

**Pozos a Tierra**

- `tipo_pozo` (with/sin caja de registro)
- `ubicacion` (optional)
- `resistencia_ohm` (optional measurement)
- `fecha_medicion` (optional measurement date)

These must not be invented during implementation. They are added after the source columns and units are confirmed.

### 3.3 Progress event tables

Create `soldaduras_avances` and `pozos_tierra_avances`.

| Field | Purpose |
| --- | --- |
| `id` | Event UUID. |
| parent record ID | FK to the matching root table. |
| `cantidad` | Quantity executed in this event; strictly greater than zero. |
| `fecha_avance` | Date used for production history. |
| `comentarios` | Optional limited note. |
| `created_by`, `created_at` | Who registered the progress and when. |

When an event is inserted, edited or deleted, a safe database function recalculates `cantidad_ejecutada`, `fecha_ejecucion` and `estado` on the parent record. This avoids the dashboard and Excel exports disagreeing.

## 4. Permissions

Existing area-scoped RLS remains the baseline.

| Action | Admin | Supervisor | Regular user |
| --- | ---: | ---: | ---: |
| View records in permitted area | Yes | Yes | Yes |
| Download permitted-area Excel | Yes | Yes | Yes |
| Register/edit execution progress | Yes | Yes | Yes, if currently allowed by project policy |
| Edit planned quantity (`cantidad_ot`) | Yes | Yes | No |
| Import or replace master records | Yes | Yes | No |
| Delete master records / events | Yes | Yes | No |

Before migration, the current project role definitions must be reconciled with the current memberships policy, because the older foundation migration only names `admin` and `user` while recent cable rules also use `supervisor`.

## 5. Dashboard behaviour

Each dashboard includes:

1. **Area-aware header:** active Área Seca/Área Húmeda applies to every query and export.
2. **Filters:** Tipo, WBS and Sistema; clicking a bar applies the same selection to cards, charts, production timeline and detail drawer.
3. **Cards:**
   - Cantidad total (UND)
   - Cantidad ejecutada (UND)
   - Cantidad pendiente (UND)
   - Percentage complete gauge
   - Total records / completed records
4. **Charts:** stacked Ejecutado / Pendiente by Tipo, WBS and Sistema.
5. **Producción ejecutada en el tiempo:** quantities grouped by `fecha_avance`; uses progress events, not the record import date.
6. **Detalle:** full-width/right-side drawer, preserving all active dashboard filters; sortable/filterable headers and a compact mobile view.
7. **No dispatch UI:** no dispatched amount, warehouse deviation, VALE, received-by, dispatch modal or dispatch-export sheet.

## 6. Detail table and controlled editing

Base visible columns:

`CÓDIGO` | `WBS` | `SISTEMA` | `TIPO` | `DESCRIPCIÓN` | `CANTIDAD OT (UND)` | `EJECUTADO (UND)` | `% AVANCE` | `FECHA ÚLTIMO AVANCE` | `ESTADO`

- The planned quantity can be edited only by Admin/Supervisor and must create an audit entry.
- A progress action opens a small dialog to add one execution event (quantity, date, optional comment).
- A record row can show its event history. Corrections must preserve a trace of the responsible user and time.
- Row colour semantics remain consistent with current PAT: completed/advanced = green; pending = red.

## 7. Excel import and export

### Import

- Separate templates and import profiles: `SOLDADURAS` and `POZOS_TIERRA`.
- Import is available only to Admin/Supervisor.
- The active area is stamped as `project_area_id`; it is not trusted from a free-text spreadsheet column.
- Pre-validation reports blank mandatory values, duplicate codes, negative quantities, invalid dates and unknown columns before any write.
- Re-import updates a matching `codigo_unico` only after displaying a summary of additions and updates. It must never silently overwrite execution events.

Initial mandatory template columns:

`CODIGO` | `WBS` | `SISTEMA` | `TIPO` | `CANTIDAD OT (UND)`

Optional: `DESCRIPCION`, `PLANO`, and the module-specific columns confirmed later.

### Export

- Export contains records only from the active area and active dashboard filters.
- One sheet, `Resumen`, contains the visible detail-table data.
- One sheet, `Historial de avances`, lists event-level quantities, date, comment and creator.
- No dispatch sheets are generated for either module in version 1.

## 8. Navigation and UI

- Add two entries in the project navigation: **Soldaduras** and **Pozos a Tierra**.
- Use dedicated components/routes rather than routing them through Cable/PAT conditionals.
- Extract reusable visual components into unit-neutral building blocks where practical: bar chart, gauge, filter state, detail drawer and production timeline.
- Retain the completed mobile rules: one card at a time on phones, non-overlapping filter controls, charts with readable legends, and detail drawers usable on narrow screens.

## 9. Implementation sequence

1. Confirm source Excel headers and the exact unique code for each module.
2. Finalize module-specific fields and validation rules.
3. Add migrations: tables, constraints, indexes, audit triggers, progress-event functions and RLS policies.
4. Run migrations in Supabase and verify permissions with Admin, Supervisor and regular-user accounts.
5. Build unit-neutral dashboard utilities and the two routes/navigation entries.
6. Build import templates, pre-validation and controlled master-data import.
7. Build detail tables, progress registration/history and exports.
8. Test Área Seca and Área Húmeda isolation, mobile layouts, imports, edits, charts and exports.
9. Seed a small representative test dataset before importing production data.

## 10. Information required before implementation

1. One representative Excel file for Soldaduras and one for Pozos a Tierra, with headers and 5–10 real/sanitized rows each.
2. Confirmation of the code/tag column that is unique for each module.
3. Confirmation whether a line represents one physical item (planned quantity normally 1) or a quantity of identical items.
4. Confirmation of the Soldaduras and Pozos type lists and whether resistance measurements for wells are needed in version 1.

