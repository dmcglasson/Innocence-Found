/** @jest-environment jsdom */

import { jest } from '@jest/globals';

// Shared dependency seam for dashboard module internals.
const getSupabaseClientMock = jest.fn();

const chaptersTab = {
  fetchRows: jest.fn(),
  renderRows: jest.fn(),
  getMeta: jest.fn(),
  handleClick: jest.fn(),
};

const worksheetsTab = {
  fetchRows: jest.fn(),
  renderRows: jest.fn(),
  getMeta: jest.fn(),
  handleClick: jest.fn(),
};

const usersTab = {
  fetchRows: jest.fn(),
  renderRows: jest.fn(),
  getMeta: jest.fn(),
  handleClick: jest.fn(),
};

const commentsTab = {
  fetchRows: jest.fn(),
  renderRows: jest.fn(),
  getMeta: jest.fn(),
  handleClick: jest.fn(),
};

// Mock each tab module so tests can verify dispatch and wiring behavior only.
jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/shared.js', () => ({
  TAB_KEYS: {
    CHAPTERS: 'chapters',
    WORKSHEETS: 'worksheets',
    USERS: 'users',
    COMMENTS: 'comments',
  },
  escapeHtml: (value) => String(value ?? ''),
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/chapters-tab.js', () => ({
  chaptersTab,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/worksheets-tab.js', () => ({
  worksheetsTab,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/users-tab.js', () => ({
  usersTab,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/comments-tab.js', () => ({
  commentsTab,
}));

const { initializeAdminDashboard } = await import('../js/modules/admin-dashboard.js');

// Generates consistent tab metadata used by the dashboard renderer.
function baseMeta(title, empty = 'No data') {
  return {
    title,
    subtitle: `${title} subtitle`,
    headers: ['Col A', 'Col B'],
    empty,
  };
}

function buildDashboardDom() {
  document.body.innerHTML = `
    <div id="adminDashboardLayout" style="display:none;">
      <div id="adminDashboardTabs">
        <button type="button" data-admin-tab="chapters">Chapters</button>
        <button type="button" data-admin-tab="worksheets">Worksheets</button>
        <button type="button" data-admin-tab="users">Users</button>
        <button type="button" data-admin-tab="comments">Comments</button>
      </div>
      <div id="adminTabControls"></div>
      <div id="adminDashboardStatus"></div>
      <div id="adminPanelSubtitle"></div>
      <h2 id="adminTableTitle"></h2>
      <div id="adminTableWrap">
        <table>
          <thead id="adminTableHeader"></thead>
          <tbody id="adminTableBody"></tbody>
        </table>
      </div>
    </div>
  `;
}

// Allows click handlers and async render promises to settle before assertions.
async function flushAsyncUi() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initializeAdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    getSupabaseClientMock.mockReturnValue({});

    chaptersTab.getMeta.mockReturnValue(baseMeta('Chapters', 'No chapters found.'));
    chaptersTab.fetchRows.mockResolvedValue({ success: true, rows: [{ id: 1 }] });
    chaptersTab.renderRows.mockReturnValue('<tr><td>chapter row</td></tr>');
    chaptersTab.handleClick.mockResolvedValue(false);

    worksheetsTab.getMeta.mockReturnValue(baseMeta('Worksheets', 'No worksheets found.'));
    worksheetsTab.fetchRows.mockResolvedValue({ success: true, rows: [{ id: 2 }] });
    worksheetsTab.renderRows.mockReturnValue('<tr><td>worksheet row</td></tr>');
    worksheetsTab.handleClick.mockResolvedValue(false);

    usersTab.getMeta.mockReturnValue(baseMeta('Users', 'No users found.'));
    usersTab.fetchRows.mockResolvedValue({ success: true, rows: [] });
    usersTab.renderRows.mockReturnValue('');
    usersTab.handleClick.mockResolvedValue(false);

    commentsTab.getMeta.mockReturnValue(baseMeta('Comments', 'No comments found.'));
    commentsTab.fetchRows.mockResolvedValue({ success: true, rows: [] });
    commentsTab.renderRows.mockReturnValue('');
    commentsTab.handleClick.mockResolvedValue(false);
    commentsTab.getControls = undefined;
    commentsTab.bindControls = undefined;
  });

  // Verifies initializer exits cleanly when dashboard roots are missing.
  test('returns early when required dashboard roots are missing', async () => {
    document.body.innerHTML = '<div id="adminDashboardLayout"></div>';

    await initializeAdminDashboard();

    expect(chaptersTab.fetchRows).not.toHaveBeenCalled();
  });

  // Verifies requested tab from session is used when valid and then cleared.
  test('respects requested tab from session storage', async () => {
    buildDashboardDom();
    sessionStorage.setItem('adminDashboardActiveTab', 'worksheets');

    await initializeAdminDashboard();

    expect(worksheetsTab.fetchRows).toHaveBeenCalledTimes(1);
    expect(document.getElementById('adminTableTitle').textContent).toBe('Worksheets');
    expect(sessionStorage.getItem('adminDashboardActiveTab')).toBeNull();
  });

  // Verifies default dashboard load uses chapters tab and paints fetched rows.
  test('initializes chapters tab and renders fetched rows', async () => {
    buildDashboardDom();

    await initializeAdminDashboard();

    expect(chaptersTab.fetchRows).toHaveBeenCalledTimes(1);
    expect(chaptersTab.renderRows).toHaveBeenCalledWith([{ id: 1 }]);
    expect(document.getElementById('adminTableTitle').textContent).toBe('Chapters');
    expect(document.getElementById('adminTableBody').innerHTML).toContain('chapter row');
    expect(document.querySelector('[data-admin-tab="chapters"]').classList.contains('active')).toBe(true);
  });

  // Verifies renderer shows both empty results and fetch failure message states.
  test('renders empty and error states from tab fetch result', async () => {
    buildDashboardDom();
    chaptersTab.fetchRows.mockResolvedValueOnce({ success: true, rows: [] });

    await initializeAdminDashboard();
    expect(document.getElementById('adminTableBody').textContent).toContain('No chapters found.');

    chaptersTab.fetchRows.mockResolvedValueOnce({ success: false, message: 'Failed to load chapters.' });
    document.querySelector('[data-admin-tab="chapters"]').click();
    await flushAsyncUi();

    expect(document.getElementById('adminTableBody').textContent).toContain('Failed to load chapters.');
    expect(document.getElementById('adminDashboardStatus').textContent).toBe('Failed to load chapters.');
  });

  // Verifies clicking a tab switches active module and updates table content.
  test('switches tabs and invokes the selected tab module', async () => {
    buildDashboardDom();

    await initializeAdminDashboard();
    document.querySelector('[data-admin-tab="worksheets"]').click();
    await flushAsyncUi();

    expect(worksheetsTab.fetchRows).toHaveBeenCalledTimes(1);
    expect(document.getElementById('adminTableTitle').textContent).toBe('Worksheets');
    expect(document.getElementById('adminTableBody').innerHTML).toContain('worksheet row');
    expect(document.querySelector('[data-admin-tab="worksheets"]').classList.contains('active')).toBe(true);
  });

  // Verifies controls are rendered and bindControls is called when provided by tab module.
  test('renders tab controls and binds control events when available', async () => {
    buildDashboardDom();
    const bindControlsMock = jest.fn();
    commentsTab.getMeta.mockReturnValue(baseMeta('Comments', 'No comments found.'));
    commentsTab.fetchRows.mockResolvedValue({ success: true, rows: [] });
    commentsTab.getControls = jest.fn().mockResolvedValue({
      html: '<select id="adminCommentsChapterFilter"><option value="">All</option></select>',
    });
    commentsTab.bindControls = bindControlsMock;

    await initializeAdminDashboard();
    document.querySelector('[data-admin-tab="comments"]').click();
    await flushAsyncUi();

    expect(commentsTab.getControls).toHaveBeenCalled();
    expect(document.getElementById('adminTabControls').innerHTML).toContain('adminCommentsChapterFilter');
    expect(bindControlsMock).toHaveBeenCalledTimes(1);
  });

  // Verifies table-level action clicks are delegated to the active tab handler.
  test('dispatches row actions to active tab handleClick', async () => {
    buildDashboardDom();
    chaptersTab.handleClick.mockResolvedValue(true);

    await initializeAdminDashboard();

    const tableWrap = document.getElementById('adminTableWrap');
    tableWrap.innerHTML += '<button class="admin-action-btn" data-action="edit-chapter">Edit</button>';
    tableWrap.querySelector('.admin-action-btn').click();
    await flushAsyncUi();

    expect(chaptersTab.handleClick).toHaveBeenCalledTimes(1);
    const callArgs = chaptersTab.handleClick.mock.calls[0][0];
    expect(callArgs.actionBtn).not.toBeNull();
    expect(typeof callArgs.refresh).toBe('function');
  });

  // Verifies unhandled table actions clear existing status text.
  test('clears status message when action is not handled', async () => {
    buildDashboardDom();
    chaptersTab.handleClick.mockResolvedValue(false);

    await initializeAdminDashboard();

    const statusEl = document.getElementById('adminDashboardStatus');
    statusEl.textContent = 'Existing status';

    const tableWrap = document.getElementById('adminTableWrap');
    tableWrap.innerHTML += '<button class="admin-action-btn" data-action="noop">Noop</button>';
    tableWrap.querySelector('.admin-action-btn').click();
    await flushAsyncUi();

    expect(statusEl.textContent).toBe('');
  });
});