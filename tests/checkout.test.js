/**
 * @jest-environment jsdom
 */

import { createStripeCheckoutSession } from '../js/modules/checkout.js';

describe('Checkout Module', () => {
  test('checkout fails gracefully when Supabase is not initialized', async () => {
    const result = await createStripeCheckoutSession();

    expect(result.success).toBe(false);
    expect(result.message).toBe('App is not connected. Please try again later.');
  });
});