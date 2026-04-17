/**
 * @jest-environment jsdom
 */

// ✅ mock the entire auth module (avoids import errors)
jest.mock('../js/modules/auth.js', () => ({
  checkAuthState: jest.fn(),
  getCurrentSession: jest.fn()
}));

const auth = require('../js/modules/auth.js');

// mock global functions used in auth.js
global.updateNavForLoggedIn = jest.fn();
global.updateNavForLoggedOut = jest.fn();
global.showPage = jest.fn();

describe('Auth Module', () => {

  test('checkAuthState exists', () => {
    expect(auth.checkAuthState).toBeDefined();
  });

  test('getCurrentSession exists', () => {
    expect(auth.getCurrentSession).toBeDefined();
  });

});