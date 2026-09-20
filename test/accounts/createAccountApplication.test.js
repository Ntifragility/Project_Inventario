import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountApplication } from '../../src/features/accounts/application/createAccountApplication.js';

function createFakes() {
  const calls = [];
  const authGateway = {
    async signIn(input) { calls.push(['signIn', input]); },
    async verifyPassword(input) { calls.push(['verifyPassword', input]); },
    async requestPasswordReset(input) { calls.push(['requestPasswordReset', input]); },
    async updatePassword(password) { calls.push(['updatePassword', password]); },
  };
  const accountRepository = {
    async submitRequest(input) { calls.push(['submitRequest', input]); },
    async getMyRecentActivity(limit) { calls.push(['getMyRecentActivity', limit]); return []; },
    async listRequests(status) { calls.push(['listRequests', status]); return []; },
    async resolveRequest(input) { calls.push(['resolveRequest', input]); },
  };
  return { calls, authGateway, accountRepository };
}

test('signIn normalizes the email before calling the auth port', async () => {
  const fakes = createFakes();
  const accounts = createAccountApplication(fakes);

  await accounts.signIn({ email: ' USER@Example.com ', password: 'secret' });

  assert.deepEqual(fakes.calls, [[
    'signIn',
    { email: 'user@example.com', password: 'secret' },
  ]]);
});

test('changePassword verifies the current password before updating it', async () => {
  const fakes = createFakes();
  const accounts = createAccountApplication(fakes);

  await accounts.changePassword({
    email: 'user@example.com',
    currentPassword: 'old-password',
    password: 'new-password',
    confirmPassword: 'new-password',
  });

  assert.deepEqual(fakes.calls, [
    ['verifyPassword', { email: 'user@example.com', password: 'old-password' }],
    ['updatePassword', 'new-password'],
  ]);
});

test('changePassword stops when current-password verification fails', async () => {
  const fakes = createFakes();
  fakes.authGateway.verifyPassword = async () => {
    throw new Error('Invalid login credentials');
  };
  const accounts = createAccountApplication(fakes);

  await assert.rejects(
    accounts.changePassword({
      email: 'user@example.com',
      currentPassword: 'wrong-password',
      password: 'new-password',
      confirmPassword: 'new-password',
    }),
    { message: 'La contraseña actual no es correcta.' }
  );
  assert.equal(fakes.calls.some(([name]) => name === 'updatePassword'), false);
});

test('submitAccountRequest sends a normalized request to its repository port', async () => {
  const fakes = createFakes();
  const accounts = createAccountApplication(fakes);

  await accounts.submitAccountRequest({
    fullName: ' Ana Torres ',
    email: ' ANA@example.com ',
    areaCode: 'seca',
    message: '',
  });

  assert.deepEqual(fakes.calls, [[
    'submitRequest',
    {
      fullName: 'Ana Torres',
      email: 'ana@example.com',
      areaCode: 'SECA',
      message: null,
    },
  ]]);
});
