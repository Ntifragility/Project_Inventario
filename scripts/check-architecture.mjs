import { readFile } from 'node:fs/promises';

const presentationFiles = [
  'src/components/Login.jsx',
  'src/components/MyAccount.jsx',
  'src/components/AdminAccountRequestsButton.jsx',
  'src/features/accounts/presentation/hooks/useAccountActivity.js',
  'src/features/accounts/presentation/hooks/usePasswordChange.js',
  'src/features/accounts/presentation/hooks/usePendingAccountRequests.js',
  'src/contexts/ProjectAreaContext.jsx',
  'src/components/cables/CableDispatchModal.jsx',
  'src/components/cables/CableDashboard.jsx',
];

const violations = [];

for (const file of presentationFiles) {
  const source = await readFile(file, 'utf8');
  if (/from\s+['"][^'"]*supabase[^'"]*['"]/.test(source)) {
    violations.push(`${file}: presentation code imports Supabase directly`);
  }
  if (/\bsupabase\s*\.\s*(from|rpc|auth)\b/.test(source)) {
    violations.push(`${file}: presentation code calls Supabase directly`);
  }
}

if (violations.length) {
  console.error('Architecture boundary violations:\n' + violations.map(item => `- ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture boundary check passed for ${presentationFiles.length} migrated presentation files.`);
}
