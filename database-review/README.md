# Database Architecture Review Package

This folder prepares an external, read-only architecture review of the Inventario Project database.

## Repository

- GitHub: https://github.com/Ntifragility/Project_Inventario
- Database: Supabase PostgreSQL
- Main schema: `public`
- Authentication identity source: `auth.users`

## How to use this package with Fable

1. Open `FABLE_PROMPT.md` and copy the complete prompt into Fable.
2. Give Fable access to the GitHub repository, or upload the files listed in `REVIEW_MANIFEST.md`.
3. If you need the review to reflect the deployed database rather than only the repository, add a current schema-only export using `LIVE_SCHEMA_GUIDE.md`.
4. Do not upload `.env`, database passwords, access tokens, JWT secrets, or the Supabase service-role key.

## Important limitation

The repository describes the intended schema. The live Supabase database may differ when migrations have not yet been applied. Fable should explicitly compare repository migrations with a live schema-only export when one is supplied.

## Current areas of special interest

- Área Seca and Área Húmeda share operational tables and are separated by `project_area_id` plus row-level security.
- `cable_schedule.id` is the immutable cable key; `tag_unico` is the globally unique business identifier.
- `cable_despachos.cable_schedule_id` relates deliveries to cables.
- Measurement edits are audited in `cable_measurement_changes`.
- Recent dispatch migrations add comments, mandatory delivery details, and authenticated creator tracking.
- The application groups delivery records by TAG only when producing the Excel workbook; the database remains normalized with one row per delivery.

