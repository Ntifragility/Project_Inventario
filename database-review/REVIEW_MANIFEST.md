# Review Manifest

## Upload first

- `database-review/FABLE_PROMPT.md`
- `schema.sql`
- `supabase_cable_migration.sql`
- Every SQL file under `supabase/migrations/`, preserving filename order

## Application files needed to validate database usage

- `src/supabase.js` — upload only after confirming it contains environment-variable references and no embedded secrets
- `src/contexts/ProjectAreaContext.jsx`
- `src/components/cables/CableDashboard.jsx`
- `src/components/cables/PatDashboard.jsx`
- `src/components/cables/CableTable.jsx`
- `src/components/cables/CableDispatchModal.jsx`
- `src/components/cables/CableImportWizard.jsx`
- `src/components/cables/PlanosDrawer.jsx`
- `src/components/Movements.jsx`
- `src/components/Products.jsx`
- `src/components/Reports.jsx`
- `src/components/consumption/ConsumptionReport.jsx`

## Latest cable migrations to emphasize

- `20260801000000_create_project_area_foundation.sql`
- `20260801000001_add_project_area_to_operational_tables.sql`
- `20260801000003_enable_project_area_rls.sql`
- `20260801000004_block_anonymous_database_access.sql`
- `20260810000000_manage_cable_schedule_rows.sql`
- `20260830000000_manage_cable_measurements.sql`
- `20260904000000_allow_supervisor_metrado_ot.sql`
- `20260907000000_add_cable_dispatch_comments.sql`
- `20260907000001_require_cable_dispatch_details.sql`
- `20260907000002_track_cable_dispatch_creator.sql`

## Never upload

- `.env` or `.env.*`
- Supabase database passwords
- Service-role keys
- JWT secrets
- Personal access tokens
- Browser session data
- Production data rows or user lists unless separately authorized and anonymized

