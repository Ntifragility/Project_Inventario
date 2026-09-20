# Project Inventario Architecture

## 1. Purpose

This document defines the target architecture for Project Inventario. It is the reference for new development and for the incremental migration of existing code.

The project adopts **Hexagonal Architecture (Ports and Adapters)**. Its central rule is that business workflows must not depend directly on React, Supabase, XLSX, browser storage, or other delivery technologies. Those technologies connect to the application through explicit ports and adapters.

The architecture is applied pragmatically. Project Inventario remains a React single-page application backed by Supabase/PostgreSQL; it is not being converted into microservices and does not require object-oriented domain entities for every table.

## 2. Architectural goals

The architecture must make the system:

- safer to change without weakening PostgreSQL authorization;
- easier to test without rendering React or connecting to Supabase;
- understandable by business capability rather than by technical file type;
- resistant to duplicated validation, calculations, and query logic;
- capable of replacing or changing external integrations without rewriting workflows;
- incrementally migratable while production behavior remains stable.

## 3. Context

Project Inventario supports several related capabilities:

- authentication and account administration;
- project and area selection;
- products and stock balances;
- inventory movements;
- consumption and bill-of-material recipes;
- cable schedule import and management;
- cable dispatches and measurement changes;
- PAT welding and material consumption;
- drawings and document links;
- spreadsheet import and export;
- audit, backups, and system configuration.

The current application is a client-side React application. Components frequently call Supabase tables and RPC functions directly and also perform validation, calculations, spreadsheet transformation, and presentation. PostgreSQL migrations, RLS policies, constraints, triggers, and security-definer functions already provide an important server-side integrity and authorization boundary.

## 4. Architectural style

### 4.1 Hexagonal Architecture

The application is divided into an application core and external adapters.

```text
                         Driving side

  User ──> React components ──> hooks/controllers ──> use-case ports
                                                       │
                                                       ▼
                                              Application core
                                           use cases + domain rules
                                                       │
                                                       ▼
                                                driven ports
                                    ┌──────────────────┼─────────────────┐
                                    ▼                  ▼                 ▼
                             Supabase adapter     XLSX adapter     Browser adapter
                                    │
                                    ▼
                         PostgreSQL tables, RPCs,
                         constraints, triggers, RLS

                         Driven side
```

A **port** expresses what the application needs in business terms. An **adapter** translates that port to a specific technology.

Examples:

- `RegisterCableDispatch` is an application use case.
- `CableDispatchRepository` is a driven port.
- `SupabaseCableDispatchRepository` is its Supabase adapter.
- `SpreadsheetExporter` is a driven port.
- `XlsxSpreadsheetExporter` is its XLSX adapter.
- React components and hooks are driving adapters that invoke use cases.

### 4.2 Capability-oriented modules

Code is organized first by business capability, not globally by controllers, models, or services. Each capability owns the relevant presentation, application, domain, and infrastructure code.

This is a module organization rule within the hexagonal architecture, not a separate architecture name.

### 4.3 Dependency rule

Dependencies point toward business behavior:

```text
presentation ──> application ──> domain
                         ▲
                         │ implements ports defined inward
                  infrastructure
```

- Domain code imports no React, Supabase, XLSX, DOM, or browser APIs.
- Application use cases import domain code and port contracts.
- Infrastructure adapters implement driven ports and may import Supabase or XLSX.
- Presentation code invokes application use cases. It does not construct database queries.
- Composition code is allowed to know all layers because it wires adapters to ports.

## 5. Layers and responsibilities

### 5.1 Domain

The domain layer contains stable business meaning:

- value normalization and validation;
- cable totals and measurement calculations;
- dispatch invariants;
- movement and stock rules that are safe to evaluate client-side;
- role and permission vocabulary;
- import-row classification and transformation;
- pure mapping between business values.

Domain functions should be deterministic and side-effect free whenever practical.

The domain layer does **not** replace database constraints or RLS. Client-side validation improves feedback; PostgreSQL remains authoritative for persisted integrity and authorization.

### 5.2 Application

The application layer implements use cases and coordinates work:

- load a cable schedule for an area;
- register or edit a dispatch;
- import movements;
- record a PAT weld and its consumption;
- approve an account request;
- export a grouped cable workbook;
- change the active project area.

Use cases:

- accept business-oriented input;
- invoke domain validation and calculations;
- call one or more ports;
- define workflow-level error semantics;
- return business-oriented results;
- contain no JSX and no direct Supabase calls.

For simple CRUD, a use case may be a small function. Abstraction is added to protect a boundary or business rule, not to maximize the number of files.

### 5.3 Presentation

The presentation layer contains:

- React pages and components;
- view-specific hooks;
- form state and interaction state;
- loading, empty, success, and error states;
- formatting for display;
- navigation and composition of screens.

Components may decide how information is displayed. They may not decide whether a database operation is authorized or assemble Supabase queries.

A feature hook can act as a presentation model: it exposes the state and actions required by a screen while delegating workflows to application use cases.

### 5.4 Infrastructure

Infrastructure contains adapters for external technologies:

- Supabase table and RPC access;
- Supabase authentication;
- XLSX parsing and workbook creation;
- local/session storage;
- PDF and document integration;
- clocks, identifiers, and downloadable files where substitution is useful.

Adapters translate external representations into application/domain representations. Supabase row names and RPC parameter names should not leak through every component.

### 5.5 Database

PostgreSQL/Supabase is both persistence infrastructure and the final policy enforcement boundary.

It owns:

- RLS authorization and project-area isolation;
- relational integrity and uniqueness;
- atomic operations that span related rows;
- audit records that must not depend on the browser;
- trusted timestamps and authenticated identity;
- privileged operations exposed through carefully authorized RPCs;
- migration history.

Security-critical rules must never exist only in React or application services.

## 6. Target module structure

```text
src/
  app/
    App.jsx
    navigation/
    composition/
      createApplication.js

  features/
    accounts/
      domain/
      application/
        ports/
        useCases/
      infrastructure/
        supabase/
      presentation/
        components/
        hooks/

    projectAreas/
    inventory/
    movements/
    consumption/
    recipes/
    cables/
    pat/
    drawings/
    configuration/
    imports/

  shared/
    domain/
    application/
    infrastructure/
      supabase/
        client.js
        errors.js
    presentation/
      components/
      hooks/
    utilities/

supabase/
  migrations/
```

Not every feature needs every directory. Directories are introduced when they contain a real responsibility.

## 7. Port and adapter conventions

### 7.1 Port vocabulary

Ports use business language rather than transport language.

Prefer:

- `listCables(areaId, filters)`
- `registerDispatch(command)`
- `getMovementImpact(movementId)`
- `approveAccountRequest(command)`

Avoid exposing infrastructure operations such as:

- `selectFromCableSchedule()`
- `callRpc()`
- `insertRow()`

### 7.2 Data contracts

Application contracts use explicit objects. Adapters own translation to and from snake-case database rows.

```js
// Application representation
{
  cableId,
  areaId,
  deliveredLength,
  deliveredAt,
  creatorName
}

// Supabase representation is confined to the adapter
{
  cable_schedule_id,
  project_area_id,
  longitud_entregada,
  fecha_entrega,
  created_by_name
}
```

During migration, existing field names may temporarily pass through a port, but new code should not widen that exception.

### 7.3 Error contracts

Adapters translate technology errors into a small application error vocabulary, for example:

- `ValidationError`
- `AuthenticationRequiredError`
- `PermissionDeniedError`
- `ConflictError`
- `NotFoundError`
- `InfrastructureError`

Presentation maps these errors to user-facing Spanish messages. Components should not parse arbitrary PostgreSQL or Supabase error strings when a stable code is available.

### 7.4 Dependency construction

Adapters are assembled in one composition root. Use cases receive dependencies explicitly or through feature factories. Avoid importing a global Supabase client inside application and domain modules.

```js
const cableRepository = createSupabaseCableRepository(supabase);
const registerCableDispatch = createRegisterCableDispatch({ cableRepository });
```

React may consume the assembled application through context or narrowly scoped feature hooks.

## 8. State-management principles

State is classified before choosing where it lives:

- **Server state:** loaded rows, counts, and mutation results; owned by feature hooks/repositories and refreshed explicitly.
- **Workflow state:** current import step, draft dispatch, validation results; owned by a feature hook or reducer.
- **Application state:** authenticated session, active module, theme; owned near the application shell.
- **Cross-feature business context:** active project and area; exposed through a dedicated application service/context.
- **Ephemeral view state:** open dialogs, selected tabs, hover state; kept in the nearest component.

Duplicated server state should not be independently maintained by multiple large components when a single feature-level source can serve them.

## 9. Security and authorization principles

1. PostgreSQL RLS, constraints, triggers, and authorized RPCs are the final enforcement mechanisms.
2. The browser uses only the Supabase anonymous key and the authenticated user's session. Service-role credentials never enter the frontend.
3. Every area-owned query and mutation includes the active `project_area_id` when applicable, even when RLS also filters it.
4. Frontend role checks control visibility and usability; they do not grant permission.
5. Privileged or multi-table operations use narrowly scoped RPCs when an atomic server-side transaction is required.
6. `SECURITY DEFINER` functions set a safe `search_path`, validate the authenticated caller, reject caller-controlled identity where possible, and receive only necessary grants.
7. Audit identity and trusted timestamps come from the authenticated/database context rather than editable UI values wherever possible.
8. Schema changes are delivered only through ordered migrations. Application code must not assume a migration is deployed without release verification.

## 10. Data consistency and transaction boundaries

A workflow belongs in a database RPC when partial completion would produce invalid or misleading persisted state. Examples include:

- creating a PAT weld report and all associated consumption rows;
- deleting a cable and its dependent records with an audit entry;
- applying a movement that must update or validate several records atomically;
- privileged account changes that must be authorized and audited together.

Client-side orchestration is acceptable for independent reads, exports, and workflows where retries are safe and partial completion is explicitly represented.

Computed values must have one authoritative definition. A pure domain function may preview a value in the UI, but persisted or security-sensitive totals must be checked or produced by PostgreSQL.

## 11. Testing strategy

The architecture supports four test levels:

### Domain tests

Fast tests for pure calculations, normalization, validation, and mappings. No React and no database.

### Application tests

Use cases are tested with in-memory/fake ports. Tests cover orchestration, errors, and business outcomes.

### Adapter contract tests

Supabase adapters are tested against a local/test Supabase schema to verify table mappings, RPC parameters, RLS behavior, and error translation.

### Presentation tests

Focused component tests verify rendering and user interaction through mocked application services. A small number of end-to-end tests cover critical paths such as authentication, movement registration, cable dispatch, and account approval.

Migration tests must verify a clean database build and, where practical, upgrade from a representative prior schema.

## 12. Observability and audit

- Technical errors are logged with operation names and correlation context, without credentials or personal data.
- User-facing messages are safe and actionable.
- Security and business audit events are produced server-side when accountability matters.
- Import results report accepted, rejected, and duplicate rows deterministically.
- Errors are not silently converted into empty successful results.

## 13. Architectural rules for contributors

New code must follow these rules:

1. Do not add new direct Supabase calls to React components.
2. Put new workflows behind an application use case.
3. Put external-system access behind a feature or shared adapter.
4. Keep business calculations independent of JSX and browser APIs.
5. Do not duplicate authorization solely in the frontend; enforce it in PostgreSQL.
6. Do not create a generic repository that hides all business vocabulary behind CRUD methods.
7. Prefer cohesive feature modules over global folders containing hundreds of unrelated services.
8. Add tests at the lowest layer capable of proving the rule.
9. Preserve behavior during migration; refactoring and behavior changes should be separate when practical.
10. Record deliberate exceptions as an Architecture Decision Record.

## 14. Architecture Decision Records

Material decisions are recorded under `docs/adr/` using this format:

```text
# ADR-NNN: Decision title

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD

## Context
## Decision
## Consequences
## Alternatives considered
```

Initial ADRs should cover:

- adoption of Hexagonal Architecture;
- PostgreSQL/RLS as the authorization boundary;
- capability-oriented module boundaries;
- criteria for choosing RPC transactions versus direct table adapters;
- approach to server-state management if an additional library is introduced.

## 15. Non-goals

This architecture does not require:

- microservices;
- a custom backend server solely to add another layer;
- rewriting all modules before delivering features;
- dependency injection frameworks;
- classes for every domain concept;
- replacing Supabase, React, Vite, or PostgreSQL;
- moving every database rule into JavaScript.

## 16. Definition of architectural compliance

A migrated feature is compliant when:

- its React components contain presentation concerns only;
- workflows are expressed as application use cases;
- direct Supabase/XLSX/browser integration is isolated in adapters;
- domain rules can be tested without React or Supabase;
- database authorization and integrity are preserved and tested;
- public feature contracts and ownership are documented;
- the old implementation path has been removed rather than maintained indefinitely.

