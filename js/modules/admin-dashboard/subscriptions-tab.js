import { getSupabaseClient } from '../supabase.js';
import {
  TAB_KEYS,
  TABLE_CANDIDATES,
  escapeHtml,
  formatDate,
  runQueryOnCandidates,
} from './shared.js';

async function toggleSubscriptionStatus(id, currentStatus) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized.' };
  }

  const nextStatus = currentStatus === 'active' ? 'canceled' : 'active';
  const result = await runQueryOnCandidates(
    supabase,
    TABLE_CANDIDATES.subscriptions,
    (table) =>
      supabase
        .from(table)
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
  );

  return result.success ? { success: true } : { success: false, message: result.message };
}

export const subscriptionsTab = {
  key: TAB_KEYS.SUBSCRIPTIONS,

  getMeta() {
    return {
      title: 'Subscriptions',
      subtitle: 'Review member subscription states and plan assignments.',
      headers: ['User ID', 'Status', 'Plan', 'Period End', 'Actions'],
      empty: 'No subscriptions found.',
    };
  },

  async fetchRows(supabase) {
    const result = await runQueryOnCandidates(
      supabase,
      TABLE_CANDIDATES.subscriptions,
      (table) =>
        supabase
          .from(table)
          .select('id, user_id, status, plan_id, plan_type, stripe_subscription_id, current_period_start, current_period_end, created_at, updated_at')
          .order('updated_at', { ascending: false })
    );

    return {
      success: result.success,
      rows: result.data || [],
      message: result.message,
    };
  },

  renderRows(rows) {
    return rows
      .map((row) => {
        const plan = row.plan_type || row.plan_id || 'n/a';
        const periodEnd = formatDate(row.current_period_end);
        return `
          <tr>
            <td>${escapeHtml(row.user_id || '')}</td>
            <td>${escapeHtml(row.status || 'unknown')}</td>
            <td>${escapeHtml(plan)}</td>
            <td>${escapeHtml(periodEnd || 'n/a')}</td>
            <td>
              <button class="action-btn admin-action-btn" data-action="toggle-subscription-status" data-id="${escapeHtml(row.id)}" data-status="${escapeHtml(row.status || '')}">Toggle Status</button>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  async handleClick({ actionBtn, statusEl, refresh }) {
    if (!actionBtn) return false;

    const action = actionBtn.getAttribute('data-action');
    if (action !== 'toggle-subscription-status') {
      return false;
    }

    const id = actionBtn.getAttribute('data-id');
    const currentStatus = (actionBtn.getAttribute('data-status') || '').toLowerCase();
    const result = await toggleSubscriptionStatus(id, currentStatus);
    if (!result.success) {
      if (statusEl) statusEl.textContent = result.message || 'Failed to update subscription status.';
      return true;
    }

    await refresh();
    return true;
  },
};
