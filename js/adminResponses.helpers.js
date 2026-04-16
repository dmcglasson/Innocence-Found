import { getSupabaseClient } from './modules/supabase.js';
export function renderResponsesTable(data, container) {
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
      <tr data-comment-id="${item.id}">
        <td>${item.uid || item.user_id || ''}</td>
        <td>${item.message || item.content || ''}</td>
        <td>${createdAt}</td>
        <td>
          <button type="button" class="action-btn edit-response-btn" data-id="${item.id}">Edit</button>
          <button type="button" class="action-btn delete-response-btn" data-id="${item.id}">Delete</button>
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

export async function getResponsesByChapter(chapterId) {
  try {
    const supabase = getSupabaseClient();

   const { data, error } = await supabase
  .from('Comments')
  .select(`
    id,
    message,
    created_at,
    uid
  `)
  .eq('chapter_id', chapterId)
  .order('created_at', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      data: data || []
    };
  } catch (error) {
    console.error('Error loading responses by chapter:', error);
    return {
      success: false,
      message: error.message || 'Failed to load responses.',
      data: []
    };
  }
}