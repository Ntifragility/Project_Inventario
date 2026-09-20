import { createAccountApplication } from '../../features/accounts/application/createAccountApplication.js';
import {
  createSupabaseAccountRepository,
  createSupabaseAuthGateway,
} from '../../features/accounts/infrastructure/supabase/createSupabaseAccountAdapters.js';
import { createCableDispatchApplication } from '../../features/cables/application/createCableDispatchApplication.js';
import { createCableScheduleApplication } from '../../features/cables/application/createCableScheduleApplication.js';
import { createSupabaseCableDispatchRepository } from '../../features/cables/infrastructure/supabase/createSupabaseCableDispatchRepository.js';
import { createSupabaseCableScheduleRepository } from '../../features/cables/infrastructure/supabase/createSupabaseCableScheduleRepository.js';
import { createXlsxCableDispatchExporter } from '../../features/cables/infrastructure/xlsx/createXlsxCableDispatchExporter.js';
import { createProjectAreaApplication } from '../../features/projectAreas/application/createProjectAreaApplication.js';
import { createLocalAreaPreferenceStore } from '../../features/projectAreas/infrastructure/browser/createLocalAreaPreferenceStore.js';
import { createSupabaseProjectAccessRepository } from '../../features/projectAreas/infrastructure/supabase/createSupabaseProjectAccessRepository.js';
import { supabase } from '../../shared/infrastructure/supabase/client.js';

export function createApplication(client = supabase, storage = window.localStorage) {
  const authGateway = createSupabaseAuthGateway(client);
  const accountRepository = createSupabaseAccountRepository(client);
  const dispatchRepository = createSupabaseCableDispatchRepository(client);
  const dispatchExporter = createXlsxCableDispatchExporter();
  const cableScheduleRepository = createSupabaseCableScheduleRepository(client);
  const projectAccessRepository = createSupabaseProjectAccessRepository(client);
  const areaPreferenceStore = createLocalAreaPreferenceStore(storage);

  return Object.freeze({
    accounts: createAccountApplication({ authGateway, accountRepository }),
    cableDispatches: createCableDispatchApplication({ dispatchRepository, dispatchExporter }),
    cableSchedule: createCableScheduleApplication({ cableScheduleRepository }),
    projectAreas: createProjectAreaApplication({ projectAccessRepository, areaPreferenceStore }),
  });
}

export const application = createApplication();
