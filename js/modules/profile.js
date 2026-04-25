import { getCurrentSession } from "./auth.js";
import { getSupabaseClient } from "./supabase.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setDisplay(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.display = value;
}

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

function toDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const firstName = metadata.first_name || "";
  const lastName = metadata.last_name || "";
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();

  return metadata.name || metadata.full_name || combined || user?.email || "-";
}

function toSubscriberLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "subscriber") return "Subscriber";
  return "Free";
}

function getFallbackSubscriberRole(user) {
  if (user?.user_metadata?.role === "admin") return "admin";
  if (user?.user_metadata?.subscriber === true || user?.user_metadata?.subscriber === "true") {
    return "subscriber";
  }
  return "free";
}

function showStatus(message, type = "success") {
  const panel = document.getElementById("statusPanel");
  const msg = document.getElementById("statusMsg");
  if (!panel || !msg) return;

  msg.textContent = message;
  panel.style.display = "block";
  panel.dataset.status = type;
}

function clearStatus() {
  const panel = document.getElementById("statusPanel");
  const msg = document.getElementById("statusMsg");
  if (!panel || !msg) return;

  msg.textContent = "";
  panel.style.display = "none";
  panel.removeAttribute("data-status");
}

function clearErrors() {
  setDisplay("nameError", "none");
  setDisplay("emailError", "none");
  setDisplay("usernameError", "none");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setViewMode(isEditing) {
  const form = document.getElementById("profileForm");
  const editBtn = document.getElementById("editBtn");

  if (form) form.style.display = isEditing ? "block" : "none";
  if (editBtn) editBtn.style.display = isEditing ? "none" : "inline-block";
}

function setActiveTab(tabId) {
  const tabs = ["tab-profile", "tab-password", "tab-preferences"];
  const buttons = [
    ["tabBtnProfile", "tab-profile"],
    ["tabBtnPassword", "tab-password"],
    ["tabBtnPrefs", "tab-preferences"],
  ];

  tabs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? "block" : "none";
  });

  buttons.forEach(([btnId, targetTab]) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle("active", targetTab === tabId);
  });
}

async function populateProfile() {
  const supabase = getSupabaseClient();
  const session = await getCurrentSession();
  const user = session?.user;

  if (!user) {
    setText("viewName", "Not signed in");
    setText("viewName2", "Not signed in");
    setText("viewUsername", "—");
    setText("viewEmail", "-");
    setText("viewSubscription", "Subscription: -");
    setText("viewEnrolled", "-");
    setInputValue("nameInput", "");
    setInputValue("usernameInput", "");
    setInputValue("emailInput", "");
    return;
  }

  const displayName = toDisplayName(user);
  const fallbackRole = getFallbackSubscriberRole(user);

  setText("viewName", displayName);
  setText("viewName2", displayName);
  setText("viewEmail", user.email || "-");
  setText("viewEnrolled", formatDate(user.created_at));
  setInputValue("nameInput", displayName === "-" ? "" : displayName);
  setInputValue("emailInput", user.email || "");
  setText("viewUsername", "—");
  setText("viewSubscription", `Subscription: ${toSubscriberLabel(fallbackRole)}`);

  if (supabase && typeof supabase.from === "function") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, role")
      .eq("user_id", user.id)
      .maybeSingle();

    const username = profile?.username || "";
    setText("viewUsername", username || "—");
    setInputValue("usernameInput", username);
    setText("viewSubscription", `Subscription: ${toSubscriberLabel(profile?.role)}`);
  }
}

async function handleProfileSave(event) {
  event.preventDefault();
  clearStatus();
  clearErrors();

  const supabase = getSupabaseClient();
  const session = await getCurrentSession();
  const user = session?.user;

  if (!supabase || !user) {
    showStatus("You must be signed in to update your profile.", "error");
    return;
  }

  const nameInput = document.getElementById("nameInput");
  const emailInput = document.getElementById("emailInput");
  const usernameInput = document.getElementById("usernameInput");
  const toggleEmailEdit = document.getElementById("toggleEmailEdit");
  const saveBtn = document.getElementById("saveProfileBtn");

  const name = (nameInput?.value || "").trim();
  const email = (emailInput?.value || "").trim();
  const username = (usernameInput?.value || "").trim();
  const shouldUpdateEmail = !!toggleEmailEdit?.checked;

  let hasError = false;

  if (!name) {
    setDisplay("nameError", "block");
    hasError = true;
  }

  if (username.length > 30) {
    setDisplay("usernameError", "block");
    hasError = true;
  }

  if (shouldUpdateEmail && !isValidEmail(email)) {
    setDisplay("emailError", "block");
    hasError = true;
  }

  if (hasError) return;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  try {
    const payload = { data: { name, full_name: name } };
    if (shouldUpdateEmail) payload.email = email;

    const { error: authError } = await supabase.auth.updateUser(payload);
    if (authError) throw authError;

    if (typeof supabase.from === "function") {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, username: username || null }, { onConflict: "user_id" });
      if (profileError) throw profileError;
    }

    await populateProfile();
    setViewMode(false);
    showStatus("Profile updated successfully.", "success");
  } catch (error) {
    showStatus(error.message || "Failed to update profile.", "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  }
}

async function handlePasswordSave(event) {
  event.preventDefault();
  clearStatus();

  const supabase = getSupabaseClient();
  const currentPasswordInput = document.getElementById("currentPasswordInput");
  const passwordInput = document.getElementById("newPasswordInput");
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const currentPassword = (currentPasswordInput?.value || "").trim();
  const newPassword = (passwordInput?.value || "").trim();

  if (!supabase) {
    showStatus("Supabase client not initialized.", "error");
    return;
  }

  if (currentPasswordInput && !currentPassword) {
    showStatus("Please enter your current password.", "error");
    return;
  }

  if (newPassword.length < 6) {
    showStatus("Password must be at least 6 characters.", "error");
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";
  }

  try {
    const authApi = supabase.auth || {};

    if (
      currentPasswordInput &&
      typeof authApi.getUser === "function" &&
      typeof authApi.signInWithPassword === "function"
    ) {
      const { data: userData } = await authApi.getUser();
      const user = userData?.user;
      if (!user?.email) throw new Error("Could not retrieve your account details.");

      const { error: signInError } = await authApi.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error("Current password is incorrect.");
    }

    if (typeof authApi.updateUser !== "function") {
      throw new Error("Password updates are unavailable right now.");
    }

    const { error } = await authApi.updateUser({ password: newPassword });
    if (error) throw error;

    if (currentPasswordInput) currentPasswordInput.value = "";
    if (passwordInput) passwordInput.value = "";
    showStatus("Password updated successfully.", "success");
  } catch (error) {
    showStatus(error.message || "Failed to update password.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Password";
    }
  }
}

function handlePreferencesSave(event) {
  event.preventDefault();
  clearStatus();

  const prefEmailUpdates = document.getElementById("prefEmailUpdates");
  const enabled = !!prefEmailUpdates?.checked;

  localStorage.setItem("prefEmailUpdates", enabled ? "true" : "false");
  showStatus("Preferences saved.", "success");
}

function restorePreferences() {
  const prefEmailUpdates = document.getElementById("prefEmailUpdates");
  if (prefEmailUpdates) {
    prefEmailUpdates.checked = localStorage.getItem("prefEmailUpdates") === "true";
  }
}

function bindProfileEvents() {
  const editBtn = document.getElementById("editBtn");
  const cancelBtn = document.getElementById("cancelProfileBtn");
  const toggleEmailEdit = document.getElementById("toggleEmailEdit");
  const emailInput = document.getElementById("emailInput");
  const profileForm = document.getElementById("profileForm");
  const passwordForm = document.getElementById("passwordForm");
  const prefsForm = document.getElementById("prefsForm");
  const tabBtnProfile = document.getElementById("tabBtnProfile");
  const tabBtnPassword = document.getElementById("tabBtnPassword");
  const tabBtnPrefs = document.getElementById("tabBtnPrefs");

  if (editBtn && !editBtn.dataset.bound) {
    editBtn.addEventListener("click", () => {
      clearStatus();
      clearErrors();
      setViewMode(true);
    });
    editBtn.dataset.bound = "true";
  }

  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.addEventListener("click", async () => {
      await populateProfile();
      clearStatus();
      clearErrors();
      setViewMode(false);
    });
    cancelBtn.dataset.bound = "true";
  }

  if (toggleEmailEdit && !toggleEmailEdit.dataset.bound) {
    toggleEmailEdit.addEventListener("change", () => {
      if (emailInput) emailInput.disabled = !toggleEmailEdit.checked;
    });
    toggleEmailEdit.dataset.bound = "true";
  }

  if (profileForm && !profileForm.dataset.bound) {
    profileForm.addEventListener("submit", handleProfileSave);
    profileForm.dataset.bound = "true";
  }

  if (passwordForm && !passwordForm.dataset.bound) {
    passwordForm.addEventListener("submit", handlePasswordSave);
    passwordForm.dataset.bound = "true";
  }

  if (prefsForm && !prefsForm.dataset.bound) {
    prefsForm.addEventListener("submit", handlePreferencesSave);
    prefsForm.dataset.bound = "true";
  }

  if (tabBtnProfile && !tabBtnProfile.dataset.bound) {
    tabBtnProfile.addEventListener("click", () => setActiveTab("tab-profile"));
    tabBtnProfile.dataset.bound = "true";
  }

  if (tabBtnPassword && !tabBtnPassword.dataset.bound) {
    tabBtnPassword.addEventListener("click", () => setActiveTab("tab-password"));
    tabBtnPassword.dataset.bound = "true";
  }

  if (tabBtnPrefs && !tabBtnPrefs.dataset.bound) {
    tabBtnPrefs.addEventListener("click", () => setActiveTab("tab-preferences"));
    tabBtnPrefs.dataset.bound = "true";
  }
}

export async function initializeProfileScreen() {
  setActiveTab("tab-profile");
  setViewMode(false);
  clearStatus();
  clearErrors();
  restorePreferences();
  bindProfileEvents();
  await populateProfile();

  const emailInput = document.getElementById("emailInput");
  const toggleEmailEdit = document.getElementById("toggleEmailEdit");

  if (emailInput) emailInput.disabled = true;
  if (toggleEmailEdit) toggleEmailEdit.checked = false;
}