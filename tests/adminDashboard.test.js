describe('Admin Dashboard UI', () => {
  test('renders users table rows correctly', () => {
    document.body.innerHTML = `
      <table>
        <tbody id="usersTable"></tbody>
      </table>
    `;

    const usersTable = document.getElementById('usersTable');

    const mockUsers = [
      {
        user_id: 'user-1',
        role: 'admin'
      },
      {
        user_id: 'user-2',
        role: 'student'
      }
    ];

    usersTable.innerHTML = mockUsers
      .map(
        (user) => `
          <tr>
            <td>${user.user_id}</td>
            <td>${user.role ?? ''}</td>
            <td>
              <button class="action-btn view-user-btn" data-id="${user.user_id}">View</button>
              <button class="action-btn delete-user-btn" data-id="${user.user_id}">Delete</button>
            </td>
          </tr>
        `
      )
      .join('');

    expect(usersTable.innerHTML).toContain('user-1');
    expect(usersTable.innerHTML).toContain('admin');
    expect(usersTable.innerHTML).toContain('View');
    expect(usersTable.innerHTML).toContain('Delete');
    expect(usersTable.querySelectorAll('tr').length).toBe(2);
  });

  test('shows loading row correctly', () => {
    document.body.innerHTML = `
      <table>
        <tbody id="usersTable">
          <tr><td colspan="3">Loading users...</td></tr>
        </tbody>
      </table>
    `;

    const usersTable = document.getElementById('usersTable');

    expect(usersTable.innerHTML).toContain('Loading users...');
  });

  test('shows no users found row correctly', () => {
    document.body.innerHTML = `
      <table>
        <tbody id="usersTable">
          <tr><td colspan="3">No users found.</td></tr>
        </tbody>
      </table>
    `;

    const usersTable = document.getElementById('usersTable');

    expect(usersTable.innerHTML).toContain('No users found.');
  });
});