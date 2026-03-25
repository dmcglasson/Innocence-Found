import { getCurrentSession, checkAuthState, initAuthStateListener, signIn, signUp, signOut } from "./modules/auth.js";
import { initPageFromHash, showPage, setGlobalOnLoadCallback } from "./modules/navigation.js";
import { getSupabaseClient } from "./modules/supabase.js";
import { initializeProfileScreen } from "./modules/profile.js";
import {
  initializeChaptersScreen,
  initializeChapterReaderScreen,
  handleLockedChapter,
} from "./modules/chapters.js";
import {
  initializeWorksheetsScreen,
  initializeWorksheetReaderScreen,
  handleLockedWorksheet,
  fetchWorksheetMetadata,
  downloadWorksheet,
} from "./modules/worksheets.js";
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from "./modules/ui.js";
import { waitForElement } from "./utils/dom.js";
import { validateForm, sanitizeString } from "./utils/validators.js";

let worksheetsLoadToken = 0;

async function initializeScreen(pageId) {
  if (pageId === "payment-confirmation") {
    try {
      const rawPlan = localStorage.getItem("selectedPlan");
      const planData = rawPlan ? JSON.parse(rawPlan) : null;

      const nameEl = document.getElementById("planName");
      const priceEl = document.getElementById("planPrice");

      if (planData && nameEl && priceEl) {
        nameEl.textContent = planData.name || "Paid Plan";
        priceEl.textContent = planData.price || "$4.99 / month";
      }
    } catch (e) {
      console.warn("Could not load selected plan:", e);
    }
  }

  if (pageId === "profile") {
    await initializeProfileScreen();
  }

  if (pageId === "dashboard") {
    try {
      await waitForElement("#userName", 1000);
      await waitForElement("#userEmail", 1000);

      const session = await getCurrentSession();
      if (session?.user) {
        updateDashboardUserInfo(session.user);
      }
    } catch (error) {
      console.warn("Dashboard elements not found:", error);
    }

    try {
      await waitForElement("#worksheetsContainer", 2000);
      const wsBox = document.getElementById("worksheetsContainer");
      if (!wsBox) return;

      wsBox.dataset.loading = "true";
      wsBox.dataset.loaded = "false";
      wsBox.innerHTML = "<p>Loading worksheets...</p>";

      const currentLoadToken = ++worksheetsLoadToken;
      const res = await fetchWorksheetMetadata({ includeAnswerKeys: true });
      if (currentLoadToken !== worksheetsLoadToken) return;

      if (!res?.success) {
        wsBox.innerHTML = `<p>${res?.message || "Failed to load worksheets."}</p>`;
        wsBox.dataset.loading = "false";
        return;
      }

      if (!Array.isArray(res.data) || res.data.length === 0) {
        wsBox.innerHTML = "<p>No worksheets available.</p>";
        wsBox.dataset.loading = "false";
        return;
      }

      wsBox.innerHTML = res.data
        .map((w) => {
          const title = w?.title || "Worksheet";
          const description = w?.description || "";
          const id = w?.id || "";

          return `
            <div class="worksheet-item" style="margin-bottom:12px;">
              <div><strong>${title}</strong></div>
              <div style="font-size:14px; opacity:0.8;">${description}</div>
              <button class="btn btn-primary downloadWorksheetBtn" data-id="${id}">
                Download
              </button>
            </div>
          `;
        })
        .join("");

      wsBox.dataset.loaded = "true";
      wsBox.dataset.loading = "false";
    } catch (err) {
      console.error("Worksheet load error:", err);
      const wsBox = document.getElementById("worksheetsContainer");
      if (wsBox) {
        wsBox.innerHTML = "<p>Failed to load worksheets.</p>";
      }
    }
  }

  if (pageId === "login") {
    try {
      await waitForElement("#loginBox", 1000);
      toggleAuthForm("login");
    } catch (error) {
      console.warn("Auth screen elements not found:", error);
    }
  }

  if (pageId === "chapters") {
    await initializeChaptersScreen();
  }

  if (pageId === "chapter-reader") {
    await initializeChapterReaderScreen();
  }

  if (pageId === "worksheets") {
    await initializeWorksheetsScreen();
  }

  if (pageId === "worksheet-reader") {
    await initializeWorksheetReaderScreen();
  }
}

function updateSubscriberBadge() {
  const badge = document.getElementById("subscriberBadge");
  if (!badge) return;
  const isSubscriber = localStorage.getItem("isSubscriber") === "true";
  badge.style.display = isSubscriber ? "inline-block" : "none";
}

async function handleLogin(form) {
  const emailInput = form.querySelector("#loginEmail");
  const passwordInput = form.querySelector("#loginPassword");
  const loginBtn = form.querySelector("#loginBtn");

  if (!emailInput || !passwordInput || !loginBtn) return;

  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;

  const validation = validateForm(
    { email, password },
    {
      email: { required: true, type: "email" },
      password: { required: true, type: "password", minLength: 6 },
    }
  );

  if (!validation.isValid) {
    showMessage("loginMessage", Object.values(validation.errors)[0], "error");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";
  showMessage("loginMessage", "", "success");

  try {
    const result = await signIn(email, password);

    if (result.success) {
      showMessage("loginMessage", result.message, "success");

      setTimeout(async () => {
        const returnTo = sessionStorage.getItem("returnTo");

        if (returnTo) {
          sessionStorage.removeItem("returnTo");
          window.location.hash = returnTo.replace(/^#/, "");
          return;
        }

        await window.showPage("subscribe");
      }, 400);
    } else {
      showMessage("loginMessage", result.message, "error");
    }
  } catch (err) {
    showMessage("loginMessage", err?.message || "Failed to sign in", "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

async function handleSignup(form) {
  const fNameInput = form.querySelector("#signupFirstName");
  const lNameInput = form.querySelector("#signupLastName");
  const emailInput = form.querySelector("#signupEmail");
  const passwordInput = form.querySelector("#signupPassword");
  const parentInput = form.querySelector("#signupParent");
  const signupBtn = form.querySelector("#signupBtn");

  if (!fNameInput || !lNameInput || !emailInput || !passwordInput || !parentInput || !signupBtn) {
    return;
  }

  const firstName = sanitizeString(fNameInput.value);
  const lastName = sanitizeString(lNameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;
  const parent = parentInput.checked;

  const validation = validateForm(
    { firstName, lastName, email, password, parent },
    {
      firstName: { required: true, minLength: 2 },
      lastName: { required: true, minLength: 2 },
      email: { required: true, type: "email" },
      password: {
        required: true,
        type: "password",
        minLength: 8,
        pattern: /\d/,
      },
      parent: { type: "boolean" },
    }
  );

  if (!validation.isValid) {
    showMessage("signupMessage", Object.values(validation.errors)[0], "error");
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Creating account...";
  showMessage("signupMessage", "", "success");

  try {
    const result = await signUp(email, password, firstName, lastName, parent);

    if (result.success) {
      showMessage("signupMessage", result.message, "success");
      form.reset();
      setTimeout(() => toggleAuthForm("login"), 700);
    } else {
      showMessage("signupMessage", result.message, "error");
    }
  } catch (err) {
    showMessage("signupMessage", err?.message || "Failed to create account", "error");
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
}

async function handleLogout() {
  try {
    await signOut();
    await window.showPage("home");
  } catch (e) {
    alert("Error signing out");
  }
}

async function handleWorksheetUpload(form) {
  const titleInput = form.querySelector("#worksheetTitle");
  const descriptionInput = form.querySelector("#worksheetDescription");
  const fileInput = form.querySelector("#worksheetFile");
  const uploadMsg = document.getElementById("uploadMessage");
  const uploadBtn = form.querySelector('button[type="submit"]');

  if (!titleInput || !descriptionInput || !fileInput || !uploadBtn) return;

  const file = fileInput.files?.[0];
  if (!file) {
    if (uploadMsg) uploadMsg.textContent = "Please choose a PDF file.";
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";
  if (uploadMsg) uploadMsg.textContent = "";

  try {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client not initialized");

    const safeFileName = `${Date.now()}-${file.name}`;

    const { error: storageError } = await supabase.storage
      .from("Worksheets")
      .upload(safeFileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (storageError) throw storageError;

    const { error: dbError } = await supabase.from("worksheets").insert([
      {
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        file_path: safeFileName,
      },
    ]);

    if (dbError) throw dbError;

    if (uploadMsg) uploadMsg.textContent = "Worksheet uploaded successfully.";
    form.reset();

    const wsBox = document.getElementById("worksheetsContainer");
    if (wsBox) wsBox.dataset.loaded = "false";

    await initializeScreen("dashboard");
  } catch (error) {
    console.error("Worksheet upload error:", error);
    if (uploadMsg) uploadMsg.textContent = error.message || "Upload failed.";
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload Worksheet";
  }
}

function setupScreenInitialization() {
  window.showPage = async (pageId) => {
    await showPage(pageId, initializeScreen);
  };
}

function setupEventListeners() {
  document.addEventListener("submit", async (e) => {
    if (e.target.id === "loginForm") {
      e.preventDefault();
      await handleLogin(e.target);
      return;
    }

    if (e.target.id === "signupForm") {
      e.preventDefault();
      await handleSignup(e.target);
      return;
    }

    if (e.target.id === "uploadWorksheetForm") {
      e.preventDefault();
      await handleWorksheetUpload(e.target);
    }
  });

  document.addEventListener("click", async (e) => {
    const target = e.target;

    const pageLink = target.closest?.("[data-page]");
    if (pageLink) {
      e.preventDefault();
      const pageId = pageLink.getAttribute("data-page");
      if (pageId) await window.showPage(pageId);
      return;
    }

    const paidPlanBtn = target.closest?.("#select-paid-plan");
    if (paidPlanBtn) {
      e.preventDefault();

      localStorage.setItem(
        "selectedPlan",
        JSON.stringify({
          name: "Paid Plan",
          price: "$4.99 / month",
        })
      );

      const session = await getCurrentSession();
      if (session) {
        await window.showPage("payment-confirmation");
      } else {
        sessionStorage.setItem("returnTo", "#payment-confirmation");
        await window.showPage("login");
      }
      return;
    }

    const confirmBtn = target.closest?.("#confirmPaymentBtn");
    if (confirmBtn) {
      e.preventDefault();

      const text = confirmBtn.querySelector("#btnText");
      const spinner = confirmBtn.querySelector("#btnSpinner");

      if (text) text.textContent = "LOADING...";
      if (spinner) spinner.style.display = "inline-block";

      confirmBtn.style.pointerEvents = "none";

      setTimeout(async () => {
        localStorage.setItem("isSubscriber", "true");
        updateSubscriberBadge();
        await window.showPage("payment-success");
      }, 3000);

      return;
    }

    const dlBtn = target.closest?.(".downloadWorksheetBtn");
    if (dlBtn) {
      e.preventDefault();
      const id = dlBtn.getAttribute("data-id");
      const result = await downloadWorksheet(id);
      if (!result.success) {
        alert(result.message);
      }
      return;
    }

    const logoutBtn = target.closest?.("#logoutBtn");
    if (logoutBtn) {
      e.preventDefault();
      await handleLogout();
      return;
    }

    const logoutLink = target.closest?.("#logoutLink");
    if (logoutLink) {
      e.preventDefault();
      await handleLogout();
      return;
    }

    const signupSwitch = target.closest?.("#signupSwitchLink");
    if (signupSwitch) {
      e.preventDefault();
      toggleAuthForm("signup");
      return;
    }

    const loginSwitch = target.closest?.("#loginSwitchLink");
    if (loginSwitch) {
      e.preventDefault();
      toggleAuthForm("login");
      return;
    }
  });
}

async function init() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const client = getSupabaseClient();
  if (!client) {
    console.warn("Supabase client unavailable; continuing with screen routing only.");
  }

  initUI();
  updateSubscriberBadge();
  setGlobalOnLoadCallback(initializeScreen);
  setupScreenInitialization();
  setupEventListeners();

  await initPageFromHash(initializeScreen);

  if (client) {
    await checkAuthState();
  }

  initAuthStateListener(async (event) => {
    const currentPage = window.location.hash.substring(1) || "home";
    if (currentPage !== "profile") return;

    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
      await initializeProfileScreen();
      return;
    }

    if (event === "SIGNED_OUT") {
      await initializeProfileScreen();
    }
  });
}

window.handleLogout = handleLogout;
window.handleLockedChapter = handleLockedChapter;
window.handleLockedWorksheet = handleLockedWorksheet;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

let lastScrollY = window.scrollY;

window.addEventListener("scroll", () => {
  const header = document.getElementById("siteHeader");
  if (!header) return;

  if (window.scrollY > lastScrollY) {
    header.classList.add("header-hidden");
  } else {
    header.classList.remove("header-hidden");
  }

  lastScrollY = window.scrollY;
});