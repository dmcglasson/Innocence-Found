jest.mock('../js/utils/validators.js', () => ({
  isValidEmail: jest.fn(),
  isValidPassword: jest.fn()
}));

const validators = require('../js/utils/validators.js');

describe('Validators Module', () => {

  test('isValidEmail exists', () => {
    expect(validators.isValidEmail).toBeDefined();
  });

  test('isValidPassword exists', () => {
    expect(validators.isValidPassword).toBeDefined();
  });

});