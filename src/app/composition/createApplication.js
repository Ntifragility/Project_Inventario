import { createAccountApplication } from '../../features/accounts/application/createAccountApplication.js';
import {
  createSupabaseAccountRepository,
  createSupabaseAuthGateway,
} from '../../features/accounts/infrastructure/supabase/createSupabaseAccountAdapters.js';
import { createProjectAreaApplication } from '../../features/projectAreas/application/createProjectAreaApplication.js';
import { createLocalAreaPreferenceStore } from '../../features/projectAreas/infrastructure/browser/createLocalAreaPreferenceStore.js';
import { createSupabaseProjectAccessRepository } from '../../features/projectAreas/infrastructure/supabase/createSupabaseProjectAccessRepository.js';
import { supabase } from '../../shared/infrastructure/supabase/client.js';

export function createApplication(client = supabase, storage = window.localStorage) {
  const authGateway = createSupabaseAuthGateway(client);
  const accountRepository = createSupabaseAccountRepository(client);
  const projectAccessRepository = createSupabaseProjectAccessRepository(client);
  const areaPreferenceStore = createLocalAreaPreferenceStore(storage);

  return Object.freeze({
    accounts: createAccountApplication({ authGateway, accountRepository }),
    projectAreas: createProjectAreaApplication({ projectAccessRepository, areaPreferenceStore }),
  });
}

export const application = createApplication();
