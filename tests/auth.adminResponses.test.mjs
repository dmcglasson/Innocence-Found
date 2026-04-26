import { jest } from '@jest/globals';

const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockFrom = jest.fn();

const mockSupabase = {
  from: mockFrom
};

jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: jest.fn(() => mockSupabase)
}));

const { updateCommentById, deleteCommentById } = await import('../js/modules/auth.js');

describe('Admin response auth helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updateCommentById updates a comment successfully', async () => {
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const result = await updateCommentById(46, 'Updated test message');

    expect(mockFrom).toHaveBeenCalledWith('Comments');
    expect(mockUpdate).toHaveBeenCalledWith({ message: 'Updated test message' });
    expect(mockEq).toHaveBeenCalledWith('id', 46);
    expect(result.success).toBe(true);
  });

  test('deleteCommentById deletes a comment successfully', async () => {
    mockEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ delete: mockDelete });

    const result = await deleteCommentById(46);

    expect(mockFrom).toHaveBeenCalledWith('Comments');
    expect(mockEq).toHaveBeenCalledWith('id', 46);
    expect(result.success).toBe(true);
  });

  test('updateCommentById fails when Supabase client is missing', async () => {
    const { getSupabaseClient } = await import('../js/modules/supabase.js');
    getSupabaseClient.mockReturnValueOnce(null);

    const result = await updateCommentById(46, 'Test');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Supabase client not initialized');
  });
});