# Hexagonal Architecture Migration Plan

## 1. Objective

Incrementally migrate Project Inventario from component-centered React code with direct Supabase access to the architecture defined in `docs/ARCHITECTURE.md`.

The migration must preserve production behavior, PostgreSQL RLS, auditability, and project-area isolation. It is a controlled refactor, not a rewrite.

## 2. Current-state assessment

As of 2026-09-21, the repository has several useful architectural foundations:

- business capabilities are already recognizable in the UI;
- the database has ordered migrations;
- Supabase authentication is centralized at application startup;
- `ProjectAreaContext` provides shared area selection;
- PostgreSQL RLS and RPC functions enforce important permissions;
- some calculation and import helpers already exist outside components.

The primary migration problems are:

- Supabase table and RPC calls are distributed across React components;
- components combine rendering, state, validation, authorization hints, workflow coordination, persistence, and export logic;
- several components are very large, including `Config.jsx`, `SmartImportWizard.jsx`, `CableTable.jsx`, and `Movements.jsx`;
- database row shapes and RPC parameters leak directly into presentation code;
- application-level error semantics are inconsistent;
- automated code tests are effectively absent;
- architectural boundaries are not enforced by tooling or review rules.

## 3. Migration principles

1. **Preserve behavior first.** Establish characterization tests before moving risky logic.
2. **Migrate by capability.** Complete one end-to-end slice before starting many partial abstractions.
3. **Move, then improve.** First isolate existing behavior; change business rules in a separate step.
4. **Keep migrations deployable.** Every intermediate commit must build and, where possible, be releasable.
5. **Protect security boundaries.** RLS and privileged RPC behavior must be verified whenever an adapter changes.
6. **Avoid permanent dual paths.** Temporary compatibility wrappers have an owner and removal milestone.
7. **Measure progress by removed coupling.** File count is not success; fewer UI-to-Supabase dependencies and better tests are.

## 4. Target migration sequence

The recommended sequence balances learning, risk, and business value:

1. architecture foundation and test harness;
2. accounts and authentication support;
3. project-area access;
4. cable dispatch vertical slice;
5. cable schedule/table and cable imports;
6. PAT workflows;
7. inventory movements;
8. products and stock;
9. consumption and recipes;
10. drawings;
11. configuration and administration;
12. generic spreadsheet import infrastructure;
13. application shell and final cleanup.

Accounts provide a small pilot. Cable dispatch then proves the approach on a representative workflow containing reads, writes, roles, area isolation, history, and exports. Large modules are migrated after conventions have been validated.

## 5. Phase 0 — Baseline and safety net

### Work

- Record current production-critical workflows and expected results.
- Add a JavaScript test runner compatible with Vite.
- Add React component testing support and a browser-like test environment.
- Add linting rules if none are present.
- Add scripts for unit tests, integration tests, and linting.
- Capture a list of direct Supabase imports and calls as the coupling baseline.
- Verify that the complete migration chain can build a clean local/test database.
- Define representative test fixtures with anonymized data for both project areas and all roles.
- Confirm that `.env`, exports, personal data, and temporary output are ignored.

### Characterization tests to add first

- cable total calculations and dispatch overrides;
- cable import column mapping and normalization;
- movement import duplicate detection;
- active-area selection and restoration;
- permission-dependent UI visibility;
- grouped cable Excel export shape;
- PAT consumption calculation.

### Exit criteria

- Existing application build passes.
- Test command runs in local development and continuous integration.
- Critical pure logic has initial characterization coverage.
- A clean test database can be created from migrations.
- Baseline metrics are recorded.

## 6. Phase 1 — Architectural foundation

### Work

- Create `src/app`, `src/features`, and `src/shared` roots.
- Move the Supabase client behind `shared/infrastructure/supabase/client.js` while temporarily re-exporting it from `src/supabase.js`.
- Introduce shared application errors and Supabase error translation.
- Establish naming and contract conventions from `ARCHITECTURE.md`.
- Create a composition root that assembles repositories and use cases.
- Add architectural import rules:
  - domain cannot import application, infrastructure, or presentation;
  - application cannot import presentation or concrete adapters;
  - presentation cannot import the Supabase client directly;
- Add ADRs for architecture, authorization boundary, and RPC transaction criteria.

### Deliverables

```text
src/shared/application/errors/
src/shared/infrastructure/supabase/
src/app/composition/
docs/adr/
```

### Exit criteria

- The old application still runs through compatibility exports.
- One test proves a fake port can replace a Supabase adapter.
- New direct Supabase imports in presentation code are blocked.

## 7. Phase 2 — Pilot: accounts

### Scope

- `Login.jsx`
- `MyAccount.jsx`
- `AdminAccountRequestsButton.jsx`
- account-related portions of `Config.jsx`
- account-related RPC calls

### Target use cases

- `signIn`
- `requestPasswordReset`
- `completePasswordRecovery`
- `submitAccountRequest`
- `getMyRecentActivity`
- `changePassword`
- `listPendingAccountRequests`
- `resolveAccountRequest`

### Ports and adapters

- `AuthGateway` implemented by Supabase Auth.
- `AccountRequestRepository` implemented by account RPCs.
- `AccountActivityRepository` implemented by the activity RPC.

### Work

- Extract validation and normalization from forms.
- Add feature hooks that expose view state and actions.
- Translate Supabase errors before they reach components.
- Keep authorization in existing RPC/RLS policies.
- Split account administration UI from unrelated configuration UI.

### Exit criteria

- Account components contain no direct Supabase calls.
- Use cases have unit tests using fake ports.
- Adapter tests verify RPC parameter mappings and authorization failures.
- Existing user-visible behavior remains unchanged.

## 8. Phase 3 — Project and area context

### Scope

- `ProjectAreaContext.jsx`
- `ProjectAreaSelector.jsx`
- project membership and area queries
- local-storage selection persistence

### Target design

- `ProjectAccessRepository` loads membership and available areas.
- `AreaPreferenceStore` abstracts local storage.
- `loadProjectAccess` selects and validates the initial area.
- React context becomes a thin presentation adapter over the application service.

### Required verification

- admin, supervisor, and user access;
- Área Seca and Área Húmeda visibility;
- stale or unauthorized stored area identifiers;
- users with no membership or no active areas;
- logout/login transitions between different users.

### Exit criteria

- The context imports no Supabase client or browser storage directly.
- Area selection behavior is covered by application tests.
- Database RLS tests confirm cross-area isolation.

## 9. Phase 4 — Cable dispatch vertical slice

### Scope

- `CableDispatchModal.jsx`
- dispatch-related sections of `CableTable.jsx`
- `cable_despachos` queries and creator RPCs
- dispatch validation, history, totals, and export mapping

### Target use cases

- `listCableDispatches`
- `registerCableDispatch`
- `editCableDispatch`
- `deleteCableDispatch`
- `listDispatchCreators`
- `buildDispatchHistory`

### Work

- Define a stable dispatch application model.
- Extract mandatory-field and numeric validation as pure domain functions.
- Isolate row mapping in `SupabaseCableDispatchRepository`.
- Move workflow state into `useCableDispatchForm` and `useCableDispatchHistory`.
- Confirm whether multi-step operations require atomic RPCs.
- Preserve `cable_schedule.id` as the relationship key.
- Ensure identity and timestamps are server-authoritative where possible.

### Tests

- create, edit, and delete permission matrix;
- area isolation;
- invalid/negative/empty quantities;
- dispatch totals and overrides;
- creator identity and timestamps;
- conflict and stale-record handling;
- history and export output.

### Exit criteria

- Dispatch presentation code has no database query construction.
- Use-case and adapter contract tests pass.
- Equivalent results are observed against representative data.

## 10. Phase 5 — Cable schedule and import

### Scope

- `CableDashboard.jsx`
- `CableTable.jsx`
- `CableImportWizard.jsx`
- cable charts, gauges, and timeline
- cable parser configuration and metrics

### Decomposition

```text
features/cables/
  domain/
    cableMetrics.js
    cableValidation.js
    cableImportMapping.js
  application/
    ports/CableRepository.js
    useCases/listCables.js
    useCases/editCableMeasurement.js
    useCases/deleteCable.js
    useCases/importCableSchedule.js
    useCases/exportCableWorkbook.js
  infrastructure/
    supabase/SupabaseCableRepository.js
    xlsx/XlsxCableImporter.js
    xlsx/XlsxCableExporter.js
  presentation/
    components/
    hooks/
```

### Work

- Extract querying, filtering, sorting, pagination, selection, and export into separate responsibilities.
- Consolidate cable and PAT variations only where their business rules are actually shared.
- Replace dynamic table names with explicit repository methods or a constrained strategy selected by trusted code.
- Give computed cable totals one named authoritative rule.
- Keep one normalized database row per delivery; pivot only in the export adapter.
- Move workbook-specific column widths, labels, and formatting to the XLSX adapter.

### Exit criteria

- `CableTable.jsx` becomes a composition of focused components and hooks.
- Cable import and export can be tested without rendering React.
- Direct cable-related Supabase access exists only in adapters.
- Existing database security and audit behavior is unchanged or deliberately strengthened through migrations.

## 11. Phase 6 — PAT

### Scope

- `PatDashboard.jsx`
- PAT-specific behavior in cable components/imports
- PAT weld reports and consumption tables/RPCs

### Target use cases

- `listPatItems`
- `registerPatWeld`
- `getPatWeldHistory`
- `calculatePatConsumption`
- `importPatSchedule`

### Work

- Define the boundary between shared cable concepts and PAT-specific concepts.
- Keep weld registration plus consumption atomic through the database RPC.
- Extract PAT calculations into pure functions and verify them against database results.
- Isolate PAT spreadsheet mappings from generic spreadsheet parsing.

### Exit criteria

- PAT components contain no direct Supabase/XLSX access.
- Atomicity, audit identity, area isolation, and retries are tested.

## 12. Phase 7 — Inventory movements

### Scope

- `Movements.jsx`
- `MovementImportWizard.jsx`
- movement-related parts of `SmartImportWizard.jsx`
- movement RPCs and stock views

### Target use cases

- `listMovements`
- `registerMovement`
- `editMovement`
- `deleteMovement`
- `previewMovementImpact`
- `importMovements`
- `exportMovements`

### Work

- Extract search, filters, paging, selection, form state, authorization prompts, and mutation workflows.
- Define movement commands independently of database row names.
- Make imports explicitly idempotent using the established area/key identity.
- Keep authorized edits/deletions and their audit effects server-side.
- Separate spreadsheet parsing from movement validation and persistence.

### Exit criteria

- `Movements.jsx` is a page composition rather than a complete subsystem.
- Movement rules and import behavior have deterministic tests.
- Partial import failure and retry behavior are documented and tested.

## 13. Phase 8 — Products, stock, consumption, and recipes

### Scope

- `Products.jsx`
- `Dashboard.jsx`
- `ConsumptionReport.jsx`
- `ConsumptionImport.jsx`
- `RecipeManager.jsx`

### Work

- Create inventory and consumption ports around stock views and tables.
- Decide explicitly which catalog data is global and which data is area-owned.
- Extract product import parsing and validation.
- Extract recipe expansion and consumption calculations.
- Keep stock computation authoritative in PostgreSQL views/functions.
- Remove duplicated stock-fetching and mapping logic.

### Exit criteria

- Presentation modules do not query tables/views directly.
- Stock and consumption calculations have a documented authority.
- Cross-area and role behavior is covered by adapter/RLS tests.

## 14. Phase 9 — Drawings and documents

### Scope

- `PlanosDrawer.jsx`
- `project_planos`
- `project_plano_groups`
- PDF/document URL handling

### Work

- Introduce `DrawingRepository` and `DocumentLinkGateway` where appropriate.
- Move group lookup/create/update orchestration into a use case or atomic RPC.
- Ensure group and drawing mutations cannot partially complete.
- Keep browser/PDF behavior in presentation or infrastructure adapters.

### Exit criteria

- Drawing components contain no Supabase query chains.
- Group/drawing consistency and area isolation are tested.

## 15. Phase 10 — Configuration and administration

### Scope

- remaining `Config.jsx` responsibilities;
- synonyms, warehouse users, disciplines, backups, audit logs, integrity checks, and user administration.

### Work

- Divide configuration into capability panels instead of one component.
- Create explicit admin use cases for destructive and privileged operations.
- Standardize confirmation and reauthorization flows.
- Ensure every privileged RPC validates the authenticated caller server-side.
- Keep backup payload handling out of presentation components.
- Translate technical failures into stable application errors.

### Exit criteria

- `Config.jsx` becomes a small route/page composition or is removed.
- Each administration capability has an owner, port, adapter, and permission tests.
- Destructive operations have explicit impact previews and audit verification.

## 16. Phase 11 — Shared spreadsheet infrastructure

This phase consolidates patterns discovered during earlier feature migrations. It must not begin by building a universal import framework before the feature requirements are known.

### Work

- Extract shared workbook loading, header normalization, row diagnostics, and download primitives.
- Keep feature-specific required fields, mappings, validation, and persistence inside each feature.
- Define import result contracts: accepted, rejected, skipped, duplicate, and failed.
- Support cancellation and large-file progress if justified by measured usage.
- Separate mapping-profile persistence from spreadsheet mechanics.

### Exit criteria

- Generic XLSX mechanics are shared.
- Business-specific imports remain understandable within their feature modules.
- `SmartImportWizard.jsx` is decomposed or retired.

## 17. Phase 12 — Application shell and cleanup

### Work

- Move navigation configuration out of the `App.jsx` switch.
- Keep session lifecycle, theme, inactivity handling, and navigation as separate shell concerns.
- Remove compatibility exports and abandoned legacy files.
- Remove all presentation-layer Supabase imports.
- Update README with setup, architecture, test, migration, and deployment instructions.
- Reconcile or archive stale schema snapshots and design documents.
- Add a final architecture dependency check to CI.

### Exit criteria

- Every feature meets the compliance definition in `ARCHITECTURE.md`.
- No temporary compatibility path remains.
- Build, unit, integration, adapter, RLS, and critical end-to-end tests pass.
- Operational and developer documentation reflects the actual system.

## 18. Cross-cutting database workstream

Database work continues alongside every feature phase.

For each migrated workflow:

1. Identify tables, views, functions, triggers, grants, and RLS policies used.
2. Confirm repository migrations match the deployed schema before release.
3. Test anonymous, authenticated-without-membership, user, supervisor, and admin access.
4. Test access from the wrong project area.
5. Review `SECURITY DEFINER` functions for caller validation and safe `search_path`.
6. Confirm trusted identity and timestamp sources.
7. Add missing indexes based on actual query patterns.
8. Use an RPC when an operation requires a database transaction.
9. Deliver all database changes through additive migrations first.
10. Schedule destructive cleanup only after application rollout, backups, and verification.

## 19. Delivery strategy

### Branch and pull-request size

- One feature slice or enabling change per branch.
- Prefer reviewable changes that keep the application runnable.
- Separate mechanical moves from behavior changes when possible.
- Include migration impact and rollback notes when SQL changes.

### Strangler approach

Old components continue to operate while one workflow at a time is routed through new use cases and adapters. After parity is proven, the old path is deleted.

```text
Existing component
    ├── unmigrated actions ──> existing direct access
    └── migrated action ─────> use case ──> port ──> adapter

After parity:

Thin component ──> use case ──> port ──> adapter
```

The temporary mixed state is permitted only inside an actively migrated feature.

### Release order for database-dependent changes

1. Deploy backward-compatible database migration.
2. Verify policies, grants, functions, and schema.
3. Deploy application using the new contract.
4. Observe errors and audit output.
5. Remove obsolete database objects in a later release.

## 20. Quality gates

Every migrated feature must pass:

- production build;
- domain and application tests;
- Supabase adapter contract tests;
- relevant RLS and RPC permission tests;
- regression test for project-area isolation;
- focused presentation tests;
- manual verification of critical Spanish-language workflows;
- import/export comparison when spreadsheets are involved;
- no new direct Supabase import in presentation code;
- no credentials or production data in fixtures or logs.

## 21. Progress metrics

Track these metrics at the end of each phase:

- number of React files importing the Supabase client;
- number of direct `.from()` and `.rpc()` calls in presentation code;
- number of migrated use cases with automated tests;
- size and responsibility count of the largest components;
- percentage of critical workflows covered by RLS/adapter tests;
- duplicate implementations of key calculations;
- unresolved temporary compatibility wrappers;
- production defects caused by authorization, area isolation, or import behavior.

Metrics guide the work; they are not targets to game. A smaller component that merely delegates to an unstructured generic service is not an architectural improvement.

## 22. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Refactor changes working behavior | Characterization tests, small slices, side-by-side result comparison |
| Client validation diverges from database rules | Treat database as authoritative and test adapter/RPC contracts |
| Area data leakage | Dedicated RLS matrix tests for every area-owned repository |
| Excessive abstraction slows development | Add ports only at external or meaningful business boundaries |
| Generic repositories erase business intent | Name repository methods after business operations |
| Long-lived dual architecture | Removal milestone and owner for every compatibility wrapper |
| Large spreadsheet regressions | Golden anonymized workbooks and deterministic import/export comparisons |
| Migration order or live-schema drift | Clean-build tests plus pre-release live-schema verification |
| UI fragmentation after component splitting | Keep page-level composition and feature-local design conventions |
| Security logic moves into browser | Explicit rule that frontend checks never replace RLS/RPC authorization |

## 23. Suggested milestone plan

Milestones are outcome-based; duration depends on team capacity and production constraints.

### Milestone A — Foundation proven

- Phases 0–2 complete.
- Test harness and architecture rules active.
- Accounts pilot migrated.

### Milestone B — Tenant and representative workflow proven

- Phases 3–4 complete.
- Project-area context and cable dispatch migrated.
- RLS contract testing established.

### Milestone C — Cable/PAT domain migrated

- Phases 5–6 complete.
- Cable and PAT components substantially reduced.
- Spreadsheet and transactional patterns validated.

### Milestone D — Core inventory migrated

- Phases 7–8 complete.
- Movements, products, stock, consumption, and recipes migrated.

### Milestone E — Administration and integrations migrated

- Phases 9–11 complete.
- Drawings, configuration, administration, and shared spreadsheet mechanics migrated.

### Milestone F — Architecture complete

- Phase 12 complete.
- Compatibility paths removed.
- Documentation, quality gates, and CI reflect the final architecture.

## 24. First implementation backlog

The first executable backlog should be:

1. Add test runner and test scripts.
2. Add characterization tests for `cableMetrics.js`, cable import mapping, and movement duplicate detection.
3. Add ADR-001 for Hexagonal Architecture.
4. Add ADR-002 for PostgreSQL/RLS authorization ownership.
5. Create shared application error types and Supabase error translation.
6. Relocate the Supabase client behind a compatibility re-export.
7. Create the composition root.
8. Implement `AuthGateway` and account-request ports.
9. Migrate `MyAccount.jsx` through feature hooks and account use cases.
10. Migrate `AdminAccountRequestsButton.jsx`.
11. Migrate login and account-request flows.
12. Extract the account administration panel from `Config.jsx`.
13. Run parity, permission, and build verification.
14. Remove the old account access path.
15. Review lessons before beginning `ProjectAreaContext` and cable dispatch.

## 25. Completion definition

The migration is complete when:

- React components do not directly call Supabase or XLSX;
- business workflows are represented by tested application use cases;
- external systems are reached through explicit adapters;
- domain rules are testable without UI or infrastructure;
- PostgreSQL remains the tested integrity and authorization boundary;
- project-area isolation has automated coverage;
- large components have been decomposed by responsibility;
- compatibility wrappers and duplicate legacy paths are removed;
- architecture and operational documentation match the deployed system.

