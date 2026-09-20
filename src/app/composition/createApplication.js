import { createAccountApplication } from '../../features/accounts/application/createAccountApplication.js';
import {
  createSupabaseAccountRepository,
  createSupabaseAuthGateway,
} from '../../features/accounts/infrastructure/supabase/createSupabaseAccountAdapters.js';
import { supabase } from '../../shared/infrastructure/supabase/client.js';

export function createApplication(client = supabase) {
  const authGateway = createSupabaseAuthGateway(client);
  const accountRepository = createSupabaseAccountRepository(client);

  return Object.freeze({
    accounts: createAccountApplication({ authGateway, accountRepository }),
  });
}

export const application = createApplication();
