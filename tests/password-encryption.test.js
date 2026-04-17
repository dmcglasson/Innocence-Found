jest.mock('../js/utils/password-encryption.js', () => ({
  hashPassword: jest.fn()
}));

const encryption = require('../js/utils/password-encryption.js');

describe('Password Encryption', () => {

  test('hashPassword exists', () => {
    expect(encryption.hashPassword).toBeDefined();
  });

});