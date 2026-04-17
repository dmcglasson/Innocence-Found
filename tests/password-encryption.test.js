/**
 * @jest-environment node
 */

import * as encryption from '../js/utils/password-encryption.js';

describe('Password Encryption', () => {
  test('hashPassword returns a deterministic 64-char SHA-256 hex hash', async () => {
    const first = await encryption.hashPassword('test-password');
    const second = await encryption.hashPassword('test-password');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  test('hashPassword changes when input changes', async () => {
    const first = await encryption.hashPassword('test-password');
    const second = await encryption.hashPassword('different-password');

    expect(first).not.toBe(second);
  });
});