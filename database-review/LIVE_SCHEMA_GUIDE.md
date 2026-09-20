# Live Schema Guide

Repository migrations show intended state. A trustworthy drift review also needs a schema-only description of the live Supabase database.

## Preferred option

Use Supabase's schema visualization or a schema-only database dump, then place the sanitized output in this package as:

```text
live-schema-public.sql
```

The export should contain definitions only:

- tables and columns
- primary and foreign keys
- unique and check constraints
- indexes
- views
- functions and triggers
- grants
- row-level security policies

It should contain no table rows and no credentials.

## Before uploading

Search the exported file for:

```text
password
secret
service_role
jwt
postgresql://
```

Remove any connection string, password, token, ownership command containing private account information, or production data accidentally included in comments.

## Safe fallback when a dump is unavailable

Export screenshots or CSV results from the Supabase dashboard for:

- table columns
- relationships
- policies
- functions
- triggers
- indexes

Do not export table contents. Ask Fable to mark the review as repository-only when live definitions are unavailable.

