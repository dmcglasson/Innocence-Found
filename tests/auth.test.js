/**
 * @jest-environment jsdom
 */

import * as auth from '../js/modules/auth.js';

describe('Auth Module', () => {
  test('getCurrentSession returns null when Supabase client is unavailable', async () => {
    const session = await auth.getCurrentSession();
    expect(session).toBeNull();
  });

  test('signIn fails gracefully when Supabase client is unavailable', async () => {
    const result = await auth.signIn('test@example.com', 'password123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Supabase client not initialized');
  });

  test('signOut fails gracefully when Supabase client is unavailable', async () => {
    const result = await auth.signOut();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Supabase client not initialized');
  });

  test('isCurrentUserAdmin returns false when Supabase client is unavailable', async () => {
    const isAdmin = await auth.isCurrentUserAdmin();
    expect(isAdmin).toBe(false);
  });
});

test('signIn returns an object with success and message fields', async () => {
  const result = await auth.signIn('test@example.com', 'password123');

  expect(result).toHaveProperty('success');
  expect(result).toHaveProperty('message');
});