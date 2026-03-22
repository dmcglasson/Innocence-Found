const { renderResponsesTable } = require('../adminResponses.helpers.js');

describe('Admin Responses UI', () => {

  test('renders empty state when no responses', () => {
    document.body.innerHTML = `<div id="responsesContainer"></div>`;
    const container = document.getElementById('responsesContainer');

    renderResponsesTable([], container);

    expect(container.innerHTML).toContain('No responses submitted yet');
  });

  test('renders table when responses exist', () => {
    document.body.innerHTML = `<div id="responsesContainer"></div>`;
    const container = document.getElementById('responsesContainer');

    const mockData = [
      {
        user_id: '123',
        content: 'Test response',
        created_at: '2026-03-08'
      }
    ];

    renderResponsesTable(mockData, container);

    expect(container.innerHTML).toContain('Test response');
    expect(container.innerHTML).toContain('Edit');
    expect(container.innerHTML).toContain('Delete');
  });

});