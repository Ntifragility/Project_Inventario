import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAccountRequest,
  normalizeEmail,
  validateNewPassword,
} from '../../src/features/accounts/domain/accountValidation.js';

test('normalizeEmail trims and lowercases an address', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});

test('normalizeAccountRequest returns a stable application contract', () => {
  assert.deepEqual(normalizeAccountRequest({
    fullName: '  Ana Torres  ',
    email: ' ANA@example.com ',
    areaCode: 'humeda',
    message: '  Necesito acceso  ',
  }), {
    fullName: 'Ana Torres',
    email: 'ana@example.com',
    areaCode: 'HUMEDA',
    message: 'Necesito acceso',
  });
});

test('validateNewPassword rejects mismatched passwords', () => {
  assert.throws(
    () => validateNewPassword({ password: 'abcdefgh', confirmPassword: 'abcd1234' }),
    { message: 'Las contraseñas no coinciden.' }
  );
});

test('validateNewPassword rejects reusing the current password', () => {
  assert.throws(
    () => validateNewPassword({
      currentPassword: 'abcdefgh',
      password: 'abcdefgh',
      confirmPassword: 'abcdefgh',
    }),
    { message: 'La nueva contraseña debe ser diferente de la contraseña actual.' }
  );
});
