# Account ports

`createAccountApplication` depends on two driven ports.

## AuthGateway

- `signIn({ email, password })`
- `verifyPassword({ email, password })`
- `requestPasswordReset({ email, redirectTo })`
- `updatePassword(password)`

## AccountRepository

- `submitRequest(request)`
- `getMyRecentActivity(limit)`
- `listRequests(status)`
- `resolveRequest({ requestId, status })`

The Supabase implementations live under `infrastructure/supabase`. Tests may supply in-memory fakes without importing Supabase.
