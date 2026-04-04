function renderResponsesTable(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="admin-empty-state">
        No responses submitted yet.
      </div>
    `;
    return;
  }

  const rows = data.map((item) => {
    const createdAt = item.created_at
      ? new Date(item.created_at).toLocaleDateString()
      : '';

    return `
      <tr>
        <td>${item.user_id || ''}</td>
        <td>${item.content || ''}</td>
        <td>${createdAt}</td>
        <td>
          <button class="action-btn edit-btn">Edit</button>
          <button class="action-btn delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Response</th>
          <th>Timestamp</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

module.exports = { renderResponsesTable };