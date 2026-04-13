jest.mock('../js/modules/navigation.js', () => ({
  getRedirectPage: jest.fn()
}));

const navigation = require('../js/modules/navigation.js');

describe('Navigation Module', () => {

  test('getRedirectPage exists', () => {
    expect(navigation.getRedirectPage).toBeDefined();
  });

});