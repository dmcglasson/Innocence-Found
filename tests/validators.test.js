import * as validators from '../js/utils/validators.js';

describe('Validators Module', () => {
  test('accepts valid emails and rejects malformed emails', () => {
    expect(validators.isValidEmail('user@example.com')).toBe(true);
    expect(validators.isValidEmail('bad-email')).toBe(false);
    expect(validators.isValidEmail('')).toBe(false);
  });

  test('validatePassword enforces minimum length', () => {
    const result = validators.validatePassword('12345', 6);
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('at least 6 characters');
  });

  test('validatePassword rejects common weak passwords', () => {
    const result = validators.validatePassword('password');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('too common');
  });

  test('validatePassword accepts a stronger password', () => {
    const result = validators.validatePassword('StrongerPass123');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('Password is valid');
  });
});