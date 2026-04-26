/** @jest-environment jsdom */

import { jest } from '@jest/globals';

const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockSignUp = jest.fn();
const mockSupabase = {
  auth: {
    signUp: mockSignUp,
  },
  from: mockFrom,
};

jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: jest.fn(() => mockSupabase),
}));

jest.unstable_mockModule('../js/modules/navigation.js', () => ({
  showPage: jest.fn(),
}));

jest.unstable_mockModule('../js/modules/ui.js', () => ({
  updateNavForLoggedIn: jest.fn(),
  updateNavForLoggedOut: jest.fn(),
}));

const { signUp } = await import('../js/modules/auth.js');

describe('signUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-123' },
      },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  test('creates a profile row with the user email', async () => {
    const result = await signUp('test@example.com', 'Password123!', 'Test', 'User', false);

    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      email: 'test@example.com',
      role: 'free',
      username: null,
    });
    expect(result.success).toBe(true);
  });
});