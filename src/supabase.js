// Compatibility export for features that have not yet migrated to an adapter.
// New code must import the client only inside infrastructure adapters.
export { supabase } from './shared/infrastructure/supabase/client.js';
