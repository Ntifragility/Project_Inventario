# Project-area ports

## ProjectAccessRepository

- `getMembership(userId)`
- `listActiveAreas(projectId)`

## AreaPreferenceStore

- `get({ userId, projectId })`
- `set({ userId, projectId }, areaId)`

The repository enforces no authorization by itself. PostgreSQL RLS determines which memberships and areas the authenticated user may read.
