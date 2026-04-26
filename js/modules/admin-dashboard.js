import { getSupabaseClient } from './supabase.js';
import { TAB_KEYS, escapeHtml } from './admin-dashboard/shared.js';
import { chaptersTab } from './admin-dashboard/chapters-tab.js';
import { worksheetsTab } from './admin-dashboard/worksheets-tab.js';
import { usersTab } from './admin-dashboard/users-tab.js';
import { commentsTab } from './admin-dashboard/comments-tab.js';

const TAB_MODULES = {
  [TAB_KEYS.CHAPTERS]: chaptersTab,
  [TAB_KEYS.WORKSHEETS]: worksheetsTab,
  [TAB_KEYS.USERS]: usersTab,
  [TAB_KEYS.COMMENTS]: commentsTab,
};

function getTabModule(tabKey) {
  return TAB_MODULES[tabKey] || TAB_MODULES[TAB_KEYS.CHAPTERS];
}

async function fetchAdminRows(tabKey) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, rows: [], message: 'Supabase client not initialized.' };
  }

  const tabModule = getTabModule(tabKey);
  return tabModule.fetchRows(supabase);
}

function renderRows(tabKey, rows) {
  const tabModule = getTabModule(tabKey);
  return tabModule.renderRows(rows);
}

function getTabMeta(tabKey) {
  const tabModule = getTabModule(tabKey);
  return tabModule.getMeta();
}

async function renderTabControls(tabKey, refresh) {
  const controlsRoot = document.getElementById('adminTabControls');
  if (!controlsRoot) return;

  const tabModule = getTabModule(tabKey);
  controlsRoot.innerHTML = '';

  if (typeof tabModule.getControls !== 'function') {
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const controls = await tabModule.getControls({ supabase });
  if (!controls || !controls.html) {
    return;
  }

  controlsRoot.innerHTML = controls.html;

  if (typeof tabModule.bindControls === 'function') {
    tabModule.bindControls({ controlsRoot, refresh });
  }
}

async function renderTab(tabKey) {
  const statusEl = document.getElementById('adminDashboardStatus');
  const tableWrap = document.getElementById('adminTableWrap');
  const tableTitle = document.getElementById('adminTableTitle');
  const tableHeader = document.getElementById('adminTableHeader');
  const tableBody = document.getElementById('adminTableBody');
  const subtitle = document.getElementById('adminPanelSubtitle');

  if (!tableWrap || !tableTitle || !tableHeader || !tableBody || !subtitle) {
    return;
  }

  const meta = getTabMeta(tabKey);
  tableTitle.textContent = meta.title;
  subtitle.textContent = meta.subtitle;
  await renderTabControls(tabKey, async () => renderTab(tabKey));
  tableBody.innerHTML = `<tr><td colspan="${meta.headers.length}">Loading...</td></tr>`;
  tableHeader.innerHTML = meta.headers.map((head) => `<th>${escapeHtml(head)}</th>`).join('');

  const result = await fetchAdminRows(tabKey);
  if (!result.success) {
    const message = result.message || 'Failed to load data.';
    tableBody.innerHTML = `<tr><td colspan="${meta.headers.length}">${escapeHtml(message)}</td></tr>`;
    if (statusEl) statusEl.textContent = message;
    return;
  }

  const rows = Array.isArray(result.rows) ? result.rows : [];
  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="${meta.headers.length}">${escapeHtml(meta.empty)}</td></tr>`;
    if (statusEl) statusEl.textContent = '';
    return;
  }

  tableBody.innerHTML = renderRows(tabKey, rows);
  if (statusEl) statusEl.textContent = '';
}

function setActiveTabButton(tabKey) {
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    const isActive = btn.getAttribute('data-admin-tab') === tabKey;
    btn.classList.toggle('active', isActive);
  });
}

export async function initializeAdminDashboard() {
  const layout = document.getElementById('adminDashboardLayout');
  const tabsRoot = document.getElementById('adminDashboardTabs');

  if (!layout || !tabsRoot) {
    return;
  }

  layout.style.display = 'grid';
  const requestedTab = sessionStorage.getItem('adminDashboardActiveTab');
  let activeTab = TAB_MODULES[requestedTab] ? requestedTab : TAB_KEYS.CHAPTERS;
  sessionStorage.removeItem('adminDashboardActiveTab');

  const refresh = async () => {
    await renderTab(activeTab);
  };

  tabsRoot.addEventListener('click', async (event) => {
    const tabBtn = event.target.closest('[data-admin-tab]');
    if (!tabBtn) return;

    activeTab = tabBtn.getAttribute('data-admin-tab') || TAB_KEYS.CHAPTERS;
    setActiveTabButton(activeTab);
    await refresh();
  });

  const tableWrap = document.getElementById('adminTableWrap');
  if (tableWrap) {
    tableWrap.addEventListener('click', async (event) => {
      const statusEl = document.getElementById('adminDashboardStatus');
      const actionBtn = event.target.closest('.admin-action-btn');
      const tabModule = getTabModule(activeTab);

      const handled = await tabModule.handleClick({
        event,
        actionBtn,
        statusEl,
        refresh,
      });

      if (!handled && statusEl) {
        statusEl.textContent = '';
      }
    });
  }

  setActiveTabButton(activeTab);
  await refresh();
}
