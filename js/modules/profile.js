/**
 * Profile screen module.
 * Reads auth user metadata and renders the profile page UI fields.
 */

import { getCurrentSession } from "./auth.js";

/**
 * Set text content for an element if it exists.
 * @param {string} id - Target element id.
 * @param {string} value - Text value to render.
 * @returns {void}
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

/**
 * Set input value for an element if it exists.
 * @param {string} id - Target input element id.
 * @param {string} value - Value to assign.
 * @returns {void}
 */
function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
}

/**
 * Format an ISO-like date string for display in the profile UI.
 * @param {string|undefined|null} dateString - Date value from user record.
 * @returns {string} Human-readable date or fallback placeholder.
 */
function formatDate(dateString) {
  if (!dateString) return "-";

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Resolve the best display name from Supabase auth metadata.
 * @param {import('@supabase/supabase-js').User} user - Authenticated user object.
 * @returns {string} Preferred full name fallback chain result.
 */
function toDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const firstName = metadata.first_name || "";
  const lastName = metadata.last_name || "";
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();

  return metadata.name || metadata.full_name || combined || user?.email || "-";
}

/**
 * Convert subscriber metadata to a UI label.
 * @param {import('@supabase/supabase-js').User} user - Authenticated user object.
 * @returns {"Subscriber"|"Free"} Subscription label for display.
 */
function toSubscriberLabel(user) {
  const metadata = user?.user_metadata || {};
  const raw = metadata.subscriber;
  const subStatus = metadata.subscription;
  const isSubscriber =
    raw === true ||
    String(raw).toLowerCase() === "true" ||
    subStatus === "active";
  return isSubscriber ? "Subscriber" : "Free";
}

/**
 * Initialize the profile screen with values from Supabase auth user metadata.
 * Populates both read-only display fields and editable form inputs.
 * @returns {Promise<void>}
 */
export async function initializeProfileScreen() {
  const session = await getCurrentSession();
  const user = session?.user;

  if (!user) {
    setText("viewName", "Not signed in");
    setText("viewName2", "Not signed in");
    setText("viewEmail", "-");
    setText("viewSubscription", "Subscription: -");
    setText("viewEnrolled", "-");
    return;
  }

  const displayName = toDisplayName(user);

  setText("viewName", displayName);
  setText("viewName2", displayName);
  setText("viewEmail", user.email || "-");
  setText("viewSubscription", `Subscription: ${toSubscriberLabel(user)}`);
  setText("viewEnrolled", formatDate(user.created_at));

  // Prefill editable fields if they are present.
  setInputValue("nameInput", displayName === "-" ? "" : displayName);
  setInputValue("emailInput", user.email || "");
}