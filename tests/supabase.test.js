/**
 * @jest-environment jsdom
 */

import { getSupabaseClient } from '../js/modules/supabase.js';

describe('Supabase Module', () => {

  test('returns null when Supabase is not configured', () => {
    const client = getSupabaseClient();
    expect(client).toBeNull();
  });

});