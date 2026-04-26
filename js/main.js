/**
 * Main Application Entry Point
 * 
 * This file initializes the application and sets up all modules.
 * It coordinates between different modules and handles the application lifecycle.
 */
import { getSupabaseClient, isSupabaseInitialized } from './modules/supabase.js';
import { initPageFromHash, showPage, setGlobalOnLoadCallback } from './modules/navigation.js';
import { checkAuthState, initAuthStateListener, signIn, signUp, signOut, getCurrentSession, getSubscriberStatus, isCurrentUserAdmin, getAllChapters, deleteCommentById, updateCommentById, deleteUserById } from './modules/auth.js';
import { initializeProfileScreen } from './modules/profile.js';
import { initializeChaptersScreen, initializeChapterReaderScreen, handleLockedChapter } from './modules/chapters.js';
import { initializeWorksheetsScreen, handleLockedWorksheet } from './modules/worksheets.js';
import { initializeAdminDashboard } from './modules/admin-dashboard.js';
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from './modules/ui.js';
import { waitForElement } from './utils/dom.js';
import { validateForm, sanitizeString } from './utils/validators.js';
import { fetchWorksheetMetadata, downloadWorksheet } from "./modules/worksheets.js";
import {
  startSubscriptionCheckout,
  initializeSubscribeScreen,
  initializeSubscriptionSuccessScreen,
  initializeSubscriptionCancelScreen,
} from "./modules/subscription.js";
import { APP_CONFIG } from './config.js';
import { createStripeCheckoutSession } from './modules/checkout.js';
import { getResponsesByChapter, renderResponsesTable } from './adminResponses.helpers.js';

let worksheetsLoadToken = 0;
const SCREEN_STYLE_ID = "active-screen-style";
const SCREEN_STYLES = {
  bookreader: "screens/bookreader.css",
};

export function syncScreenStyles(pageId) {
  const href = SCREEN_STYLES[pageId];
  let link = document.getElementById(SCREEN_STYLE_ID);

  if (!href) {
    if (link) {
      link.remove();
    }
    return;
  }

  if (!link) {
    link = document.createElement("link");
    link.id = SCREEN_STYLE_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  if (link.getAttribute("href") !== href) {
    link.setAttribute("href", href);
  }
}
/**
 * Initialize the application
 */
const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
async function init() {
  // Wait a moment for env vars to be available
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check Supabase initialization
  const client = getSupabaseClient();
  if (!client) {
    console.warn("Supabase client unavailable; continuing with screen routing only.");
  }

  // Initialize UI
  initUI();
  setGlobalOnLoadCallback(initializeScreen);

  const pageId = window.location.hash.substring(1) || 'home';

  if (pageId === 'home') {
    const yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  // Set up navigation handlers before first route render
  setupScreenInitialization();

  // Render initial route
  await initPageFromHash();

  // Check authentication state only when backend client is available
  if (client) {
    await checkAuthState();
  }

  // Initialize auth state listener
  initAuthStateListener(async (event) => {
    const currentPage = window.location.hash.substring(1) || 'home';
    if (currentPage !== 'profile') return;

    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
      await initializeProfileScreen();
      return;
    }

    if (event === 'SIGNED_OUT') {
      await initializeProfileScreen();
    }
  });

  // Set up event listeners
  setupEventListeners();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.admin-menu-btn');
    if (!btn) return;

    const tabKey = btn.getAttribute('data-admin-tab');
    if (tabKey) {
      sessionStorage.setItem('adminDashboardActiveTab', tabKey);
    }

    const page = btn.getAttribute('data-page');
    if (!page) return;

    window.location.hash = page;
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-menu-btn');
  if (!btn) return;

  const tabKey = btn.getAttribute('data-admin-tab');
  if (tabKey) {
    sessionStorage.setItem('adminDashboardActiveTab', tabKey);
  }

  document.querySelectorAll('.admin-menu-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const page = btn.getAttribute('data-page');
  if (!page) return;

  window.location.hash = page;
});
/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Login form
  document.addEventListener('submit', async (e) => {

    if (e.target.id === 'loginForm') {
      e.preventDefault();
      await handleLogin(e.target);

    } else if (e.target.id === 'signupForm') {
      e.preventDefault();
      await handleSignup(e.target);

    } else if (e.target.id === 'uploadWorksheetForm') {
      e.preventDefault();
      await handleWorksheetUpload(e.target);
    }

  });

  // Click handlers (logout + switch between login/signup)
  document.addEventListener('click', async (e) => {

    const target = e.target;
    // HOME SUBSCRIPTION BUTTON LOGIC
    const subBtn = target.closest && target.closest('#homeSubscriptionLink');
    if (subBtn) {
      e.preventDefault();

      const session = await getCurrentSession();

      if (session) {
        window.location.hash = 'subscribe';
      } else {
        sessionStorage.setItem('returnTo', '#subscribe');
        window.location.hash = 'login';
      }
      return;
    }

    const freePlanBtn = target.closest && target.closest('#select-free-plan');
    if (freePlanBtn) {
      e.preventDefault();

      localStorage.setItem('selectedPlan', JSON.stringify({
        name: 'Free Plan',
        price: '$0 / month'
      }));
      sessionStorage.setItem('returnTo', '#home');
      window.location.hash = 'login';
      return;
    }

    const paidPlanBtn = target.closest && target.closest('#select-paid-plan');
    if (paidPlanBtn) {
      sessionStorage.setItem('returnTo', '#payment-confirmation');
      console.log('PAID returnTo set:', sessionStorage.getItem('returnTo'));
      e.preventDefault();

      localStorage.setItem('selectedPlan', JSON.stringify({
        name: 'Paid Plan',
        price: '$4.99 / month'
      }));

      const session = await getCurrentSession();
      if (session) {
        window.location.hash = 'payment-confirmation';
      } else {
        sessionStorage.setItem('returnTo', '#payment-confirmation');
        window.location.hash = 'login';
      }
      return;
    }

    const confirmBtn = target.closest && target.closest('#confirmPaymentBtn');
    if (confirmBtn) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      confirmBtn.disabled = true;
      const prevText = confirmBtn.textContent;
      confirmBtn.textContent = "Redirecting to Stripe…";

      const result = await createStripeCheckoutSession();

      if (!result.success) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = prevText;
        alert(result.message || "Could not start checkout. Please try again.");
        return;
      }

      sessionStorage.removeItem('returnTo');
      window.location.href = result.url;
      return;
    }

    // Download worksheet button
    const dlBtn = target.closest && target.closest(".downloadWorksheetBtn");
    if (dlBtn) {
      e.preventDefault();
      const id = dlBtn.getAttribute("data-id");
      const result = await downloadWorksheet(id);

      if (!result.success) {
        alert(result.message);
      }

      return;
    }
    const editBtn = e.target.closest && e.target.closest('.edit-response-btn');
    if (editBtn) {
      e.preventDefault();

      const commentId = editBtn.getAttribute('data-id');

      const currentRow = document.querySelector(`tr[data-comment-id="${commentId}"]`);
      const currentText = currentRow ? currentRow.children[1].innerText : '';

      const newMessage = window.prompt('Edit response:', currentText);

      if (!newMessage || newMessage.trim() === '') return;

      const result = await updateCommentById(commentId, newMessage);

      if (!result.success) {
        alert(result.message || 'Failed to update.');
        return;
      }

      // update UI instantly
      if (currentRow) {
        currentRow.children[1].innerText = newMessage;
      }

      return;
    }

    const deleteBtn = e.target.closest && e.target.closest('.delete-response-btn');
    if (deleteBtn) {
      e.preventDefault();

      const commentId = deleteBtn.getAttribute('data-id');
      const confirmed = window.confirm('Delete this response?');

      if (!confirmed) return;

      const result = await deleteCommentById(commentId);

      if (!result.success) {
        alert(result.message || 'Failed to delete response.');
        return;
      }

      const row = document.querySelector(`tr[data-comment-id="${commentId}"]`);
      if (row) {
        const tbody = row.closest('tbody');
        row.remove();

        if (tbody && tbody.querySelectorAll('tr').length === 0) {
          const responsesContainer = document.getElementById('responsesContainer');
          if (responsesContainer) {
            responsesContainer.innerHTML = `<div class="admin-empty-state">No responses submitted yet.</div>`;
          }
        }
      }

      return;
    }
    const viewUserBtn = e.target.closest('.view-user-btn');

    if (viewUserBtn) {
      e.preventDefault();

      const userId = viewUserBtn.getAttribute('data-id');
      const role = viewUserBtn.closest('tr').children[1].innerText;

      const existingModal = document.getElementById('userDetailsModal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'userDetailsModal';
      modal.className = 'user-details-modal-overlay';
      modal.innerHTML = `
    <div class="user-details-modal">
      <h3>User Details</h3>
      <p><strong>User ID:</strong> ${userId}</p>
      <p><strong>Role:</strong> ${role}</p>
      <button type="button" id="closeUserDetailsModal" class="action-btn">Close</button>
    </div>
  `;

      document.body.appendChild(modal);

      document.getElementById('closeUserDetailsModal').addEventListener('click', () => {
        modal.remove();
      });

      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          modal.remove();
        }
      });

      return;
    }
    const deleteUserBtn = e.target.closest('.delete-user-btn');
    if (deleteUserBtn) {
      e.preventDefault();

      const userId = deleteUserBtn.getAttribute('data-id');

      const role = deleteUserBtn.closest('tr').children[1].innerText;

      if (role === 'admin') {
        alert('You cannot delete an admin account.');
        return;
      }
      const confirmed = window.confirm('Delete this user?');

      if (!confirmed) return;

      const result = await deleteUserById(userId);

      if (!result.success) {
        alert(result.message || 'Failed to delete user.');
        return;
      }

      const row = deleteUserBtn.closest('tr');
      if (row) {
        row.remove();
      }

      return;
    }

    const subscribeBtn = target.closest && target.closest(".subscribePlanBtn");
    if (subscribeBtn) {
      e.preventDefault();
      const planId = subscribeBtn.getAttribute("data-plan-id");
      const msgEl = document.getElementById("subscribeMessage");
      if (msgEl) msgEl.textContent = "";
      if (!planId) return;
      const result = await startSubscriptionCheckout(planId);
      if (!result.success && result.message && msgEl) {
        msgEl.textContent = result.message;
      }
      return;
    }

    // Logout button
    if (target.id === 'logoutBtn' || (target.closest && target.closest('#logoutBtn'))) {
      e.preventDefault();
      await handleLogout();
      return;
    }

    // Switch to signup form
    if (target.id === 'signupSwitchLink' || (target.closest && target.closest('#signupSwitchLink'))) {
      e.preventDefault();
      toggleAuthForm('signup');
      return;
    }

    // Switch to login form
    if (target.id === 'loginSwitchLink' || (target.closest && target.closest('#loginSwitchLink'))) {
      e.preventDefault();
      toggleAuthForm('login');
      return;
    }
  });

}

/**
 * Handle login form submission
 * @param {HTMLFormElement} form - Login form element
 */
export async function handleLogin(form) {
  const emailInput = form.querySelector('#loginEmail');
  const passwordInput = form.querySelector('#loginPassword');
  const loginBtn = form.querySelector('#loginBtn');
  const loginMsg = document.getElementById('loginMessage');

  if (!emailInput || !passwordInput || !loginBtn) return;

  // Sanitize and get input values
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password, but validate length

  // Validate form
  const validation = validateForm(
    { email, password },
    {
      email: { required: true, type: 'email' },
      password: { required: true, type: 'password', minLength: 6 }
    }
  );

  if (!validation.isValid) {
    showMessage('loginMessage', Object.values(validation.errors)[0], 'error');
    return;
  }

  // Update UI
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";
  showMessage('loginMessage', '', 'success');

  try {
    const result = await signIn(email, password);

    if (result.success) {
      showMessage('loginMessage', result.message, 'success');

      const returnTo = sessionStorage.getItem('returnTo');

      if (returnTo) {
        sessionStorage.removeItem('returnTo');
        window.location.hash = returnTo.replace(/^#/, '');
      } else {
        window.location.hash = 'home';
      }

      return;
    } else {
      showMessage('loginMessage', result.message, 'error');
    }
  } catch (error) {
    showMessage('loginMessage', error.message || 'Failed to sign in', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

/**
 * Handle signup form submission
 * @param {HTMLFormElement} form - Signup form element
 */
export async function handleSignup(form) {
  const fNameInput = form.querySelector('#signupFirstName');
  const lNameInput = form.querySelector('#signupLastName');
  const emailInput = form.querySelector('#signupEmail');
  const passwordInput = form.querySelector('#signupPassword');
  const parentInput = form.querySelector('#signupParent');
  const signupBtn = form.querySelector('#signupBtn');
  const signupMsg = document.getElementById('signupMessage');

  if (!fNameInput || !lNameInput || !emailInput || !passwordInput || !parentInput || !signupBtn) return;

  // Sanitize and get input values
  const firstName = sanitizeString(fNameInput.value);
  const lastName = sanitizeString(lNameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password, but validate
  const parent = parentInput.checked;

  // Validate form
  const validation = validateForm(
    { firstName, lastName, email, password, parent },
    {
      firstName: { required: true, minLength: 2 },
      lastName: { required: true, minLength: 2 },
      email: { required: true, type: 'email' },
      password: {
        required: true,
        type: 'password',
        minLength: 8,
        pattern: /\d/ // must include at least one number
      },
      parent: { type: 'boolean' }
    }
  );

  if (!validation.isValid) {
    showMessage('signupMessage', Object.values(validation.errors)[0], 'error');
    return;
  }

  // Update UI
  signupBtn.disabled = true;
  signupBtn.textContent = "Creating account...";
  showMessage('signupMessage', '', 'success');

  try {
    const result = await signUp(email, password, firstName, lastName, parent);

    if (result.success) {
      showMessage('signupMessage', result.message, 'success');
      form.reset();
      setTimeout(() => {
        toggleAuthForm('login');
      }, 2000);
    } else {
      showMessage('signupMessage', result.message, 'error');
    }
  } catch (error) {
    showMessage('signupMessage', error.message || 'Failed to create account', 'error');
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
}

/**
 * Handle logout
 */
export async function handleLogout() {

  try {
    const result = await signOut();
    if (!result.success) {
      alert("Error signing out: " + result.message);
    }
    // Navigation is handled by auth state listener
  } catch (error) {
    alert("Error signing out: " + error.message);
  }
}

export async function handleWorksheetUpload(form) {
  const titleInput = form.querySelector('#worksheetTitle');
  const descriptionInput = form.querySelector('#worksheetDescription');
  const fileInput = form.querySelector('#worksheetFile');
  const documentTypeInput = form.querySelector('#documentType');
  const chapterNumberInput = form.querySelector('#chapterNumber');
  const accessLevelInput = form.querySelector('#accessLevel');
  const releaseDateInput = form.querySelector('#releaseDate');
  const uploadMsg = document.getElementById('uploadMessage');
  const uploadBtn = form.querySelector('button[type="submit"]');

  if (!titleInput || !fileInput || !uploadBtn || !documentTypeInput) {
    console.error('Upload form elements not found');
    return;
  }

  const file = fileInput.files?.[0];
  const documentType = documentTypeInput.value;

  if (!documentType) {
    if (uploadMsg) uploadMsg.textContent = 'Please select a document type.';
    return;
  }

  if (!file) {
    if (uploadMsg) uploadMsg.textContent = 'Please choose a PDF file.';
    return;
  }

  if (file.type !== 'application/pdf') {
    if (uploadMsg) uploadMsg.textContent = 'Only PDF files are allowed.';
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    if (uploadMsg) uploadMsg.textContent = 'File too large. Max size is 10MB.';
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  if (uploadMsg) uploadMsg.textContent = '';

  try {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

    const safeFileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const accessLevel = accessLevelInput?.value || 'public';
    const is_protected = accessLevel === 'protected' || accessLevel === 'answer-key';
    const is_answer_key = accessLevel === 'answer-key';

    if (documentType === 'chapter') {
      const chapterNum = parseInt(chapterNumberInput?.value, 10);
      if (!chapterNum) {
        if (uploadMsg) uploadMsg.textContent = 'Please enter a chapter number.';
        return;
      }

      const { error: storageError } = await supabase.storage
        .from('Chapters')
        .upload(safeFileName, file, { cacheControl: '3600', upsert: false });

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('Chapters')
        .insert([{
          chapter_num: chapterNum,
          free: !is_protected,
          file_path: safeFileName,
          book_id: 1,
          title: titleInput.value.trim(),
          description: descriptionInput?.value.trim() || '',
          release_date: releaseDateInput?.value || null
        }]);



      if (dbError) {
        await supabase.storage.from('Chapters').remove([safeFileName]);
        throw dbError;
      }

    } else {
      const { error: storageError } = await supabase.storage
        .from('Worksheets')
        .upload(safeFileName, file, { cacheControl: '3600', upsert: false });

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('worksheets')
        .insert([{
          title: titleInput.value.trim(),
          description: descriptionInput?.value.trim() || '',
          file_path: safeFileName,
          is_protected,
          is_answer_key,
          release_date: releaseDateInput?.value || null
        }]);

      if (dbError) {
        await supabase.storage.from('Worksheets').remove([safeFileName]);
        throw dbError;
      }
    }

    if (uploadMsg) uploadMsg.textContent = 'Upload successful!';
    form.reset();

  } catch (error) {
    console.error('Upload error:', error);
    if (uploadMsg) uploadMsg.textContent = error.message || 'Upload failed.';
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload';
  }
}

/**
 * Initialize screen-specific logic after screen loads
 * @param {string} pageId - ID of the loaded page
 */
/**
 * Initialize screen-specific logic after screen loads
 * @param {string} pageId - ID of the loaded page
 */


export async function initializeScreen(pageId) {
  syncScreenStyles(pageId);
  // ===== ADMIN NAV VISIBILITY =====
  const adminNavItem = document.getElementById('adminNavItem');

  if (adminNavItem) {
    const isAdmin = await isCurrentUserAdmin();

    if (isAdmin && pageId !== 'admin-dashboard') {
      adminNavItem.style.display = 'block';
    } else {
      adminNavItem.style.display = 'none';
    }
  }

  if (pageId === 'home') {
    const yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  if (pageId === 'profile') {
    await initializeProfileScreen();
  }

  // Profile screen

  if (pageId === 'payment-success') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.refreshSession();
    }

    const statusEl = document.getElementById('paymentSuccessStatus');
    if (statusEl) {
      statusEl.textContent = "Confirming your subscription…";
    }

    let active = false;
    for (let i = 0; i < 10; i++) {
      const sub = await getSubscriberStatus();
      if (sub.isSubscriber) {
        active = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    if (statusEl) {
      statusEl.textContent = active
        ? "Your subscription is active. Enjoy full access."
        : "Payment received. If your access does not update within a few minutes, refresh the page or contact support.";
    }
  }

  if (pageId === 'payment-confirmation') {
    try {
      const session = await getCurrentSession();
      if (!session) {
        sessionStorage.setItem('returnTo', '#payment-confirmation');
        window.location.hash = 'login';
        return;
      }

      const rawPlan = localStorage.getItem('selectedPlan');
      const planData = rawPlan ? JSON.parse(rawPlan) : null;

      const nameEl = document.getElementById('planName');
      const priceEl = document.getElementById('planPrice');

      if (planData) {
        if (nameEl) nameEl.textContent = planData.name || 'Paid Plan';
        if (priceEl) priceEl.textContent = planData.price || '$4.99 / month';
      }
    } catch (error) {
      console.warn('Could not load selected plan:', error);
    }
  }

  // Bookreader screen (supports direct hash and DOM detection)
  if (pageId === 'bookreader' || document.getElementById('bookSelect')) {
    try {
      const { initBookReader } = await import('./modules/bookreader.js');
      await initBookReader();
    } catch (error) {
      console.warn('Bookreader screen failed to initialize:', error);
    }
  }

  // Dashboard screen
  if (pageId === "dashboard") {
    try {
      await waitForElement("#userName", 1000);
      await waitForElement("#userEmail", 1000);

      const session = await getCurrentSession();
      if (session && session.user) {
        updateDashboardUserInfo(session.user);
      }
    } catch (error) {
      console.warn("Dashboard elements not found:", error);
    }
  }
  const renderAdminAccessDenied = () => {
    const pageContainer = document.getElementById('pageContainer');
    if (!pageContainer) return;

    pageContainer.innerHTML = `
      <div class="content-section">
        <div class="auth-box">
          <h2>Access Denied</h2>
          <p>This page is for admins only.</p>
        </div>
      </div>
    `;
  };

  if (pageId === 'admin-upload') {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      renderAdminAccessDenied();
      return;
    }

    const documentTypeSelect = document.getElementById('documentType');
    const chapterNumberGroup = document.getElementById('chapterNumberGroup');
    const accessLevelGroup = document.getElementById('accessLevelGroup');

    if (documentTypeSelect) {
      documentTypeSelect.addEventListener('change', () => {
        const isChapter = documentTypeSelect.value === 'chapter';
        if (chapterNumberGroup) chapterNumberGroup.style.display = isChapter ? 'block' : 'none';
        if (accessLevelGroup) accessLevelGroup.style.display = isChapter ? 'block' : 'none';
      });
    }
  }

  if (pageId === 'admin-dashboard') {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      renderAdminAccessDenied();
      return;
    }

    await initializeAdminDashboard();
  }

  if (pageId === 'admin-responses') {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      renderAdminAccessDenied();
      return;
    }

    await waitForElement('#chapterSelect', 1000);
    await waitForElement('#responsesContainer', 1000);

    const chapterSelect = document.getElementById('chapterSelect');
    const responsesContainer = document.getElementById('responsesContainer');
    const messageEl = document.getElementById('adminResponsesMessage');

    const chapterDropdown = document.getElementById('chapterDropdown');
    const chapterDropdownTrigger = document.getElementById('chapterDropdownTrigger');
    const chapterDropdownMenu = document.getElementById('chapterDropdownMenu');
    if (!chapterSelect || !responsesContainer) return;

    const renderEmptyState = (text) => {
      responsesContainer.innerHTML = `<div class="admin-empty-state">${text}</div>`;
    };

    const renderLoadingState = (text = 'Loading responses...') => {
      responsesContainer.innerHTML = `<div class="admin-loading-state">${text}</div>`;
    };

    const renderErrorState = (text = 'Error loading responses.') => {
      responsesContainer.innerHTML = `<div class="admin-error-state">${text}</div>`;
    };

    const chaptersResult = await getAllChapters();

    if (!chaptersResult.success) {
      if (messageEl) messageEl.textContent = chaptersResult.message || 'Unable to load chapters.';
      renderErrorState('Unable to load chapters.');
      return;
    }

    chapterSelect.innerHTML = '<option value="">Choose a chapter</option>';
    if (chapterDropdownMenu) chapterDropdownMenu.innerHTML = '';

    chaptersResult.data.forEach((chapter) => {
      const option = document.createElement('option');
      option.value = chapter.id;
      option.textContent = `Chapter ${chapter.id}`;
      chapterSelect.appendChild(option);

      const customOption = document.createElement('button');
      customOption.type = 'button';
      customOption.className = 'custom-dropdown__option';
      customOption.setAttribute('data-value', chapter.id);
      customOption.textContent = `Chapter ${chapter.id}`;
      chapterDropdownMenu.appendChild(customOption);
    });

    if (chapterDropdownTrigger && chapterDropdown && chapterDropdownMenu) {
      chapterDropdownTrigger.addEventListener('click', () => {
        chapterDropdown.classList.toggle('active');
      });

      chapterDropdownMenu.addEventListener('click', async (e) => {
        const option = e.target.closest('.custom-dropdown__option');
        if (!option) return;

        const value = option.getAttribute('data-value') || '';
        const text = option.textContent;

        chapterSelect.value = value;
        chapterDropdownTrigger.textContent = text;
        chapterDropdown.classList.remove('active');

        if (!value) return;

        renderLoadingState('Loading responses...');

        const result = await getResponsesByChapter(value);

        if (!result.success) {
          renderErrorState('Failed to load responses.');
          return;
        }

        renderResponsesTable(result.data, responsesContainer);

        if (messageEl) messageEl.textContent = '';

      });

      document.addEventListener('click', (e) => {
        if (!chapterDropdown.contains(e.target)) {
          chapterDropdown.classList.remove('active');
        }
      });
    }

    renderEmptyState('No chapter selected yet.');

  }

  if (pageId === 'chapter-reader') {
    await waitForElement('#chapterTitle', 1000);

    try {
      await waitForElement("#worksheetsContainer", 2000);
      const wsBox = document.getElementById("worksheetsContainer");

      if (!wsBox) {
        console.warn("worksheetsContainer not found");
        return;
      }

      wsBox.dataset.loading = "true";
      const currentLoadToken = ++worksheetsLoadToken;

      // Always reload worksheets when entering dashboard
      wsBox.dataset.loaded = "false";

      wsBox.innerHTML = "<p>Loading worksheets...</p>";

      const res = await fetchWorksheetMetadata({ includeAnswerKeys: true });
      if (currentLoadToken !== worksheetsLoadToken) return;


      if (!res || !res.success) {
        wsBox.innerHTML = `<p>${res?.message || "Failed to load worksheets."}</p>`;
        wsBox.dataset.loading = "false";
        return;
      }

      if (!Array.isArray(res.data) || res.data.length === 0) {
        wsBox.innerHTML = "<p>No worksheets available.</p>";
        wsBox.dataset.loading = "false";
        return;
      }

      const worksheetHtml = res.data
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

      wsBox.innerHTML = worksheetHtml;
      wsBox.dataset.loaded = "true";
      wsBox.dataset.loading = "false";

    } catch (err) {
      console.error("Worksheet load error:", err);

      const wsBox = document.getElementById("worksheetsContainer");
      if (wsBox) {
        wsBox.innerHTML = "<p>Failed to load worksheets.</p>";
      }
    }

    return;
  }
  if (pageId === 'chapter-reader') {
    await initializeChapterReaderScreen();
  }

  if (pageId === 'worksheet-reader') {
    const legacyWorksheetId = sessionStorage.getItem('activeWorksheetId');
    if (legacyWorksheetId) {
      sessionStorage.removeItem('activeWorksheetId');
      await handleLockedWorksheet(legacyWorksheetId);
    }
    window.location.hash = 'worksheets';
    return;
  }

  // Login / Signup screen
  if (pageId === "login") {
    try {
      await waitForElement("#loginBox", 1000);

      const signupLink = document.getElementById("signupSwitchLink");
      const loginLink = document.getElementById("loginSwitchLink");

      if (signupLink) {
        signupLink.addEventListener("click", (e) => {
          e.preventDefault();
          toggleAuthForm("signup");
        });
      }


      if (loginLink) {
        loginLink.addEventListener("click", (e) => {
          e.preventDefault();
          toggleAuthForm("login");
        });
      }
    } catch (error) {
      console.warn("Auth screen elements not found:", error);
    }
  }


  if (pageId === 'chapters') {
    await initializeChaptersScreen();
  }

  if (pageId === 'worksheets') {
    await initializeWorksheetsScreen();
  }

  if (pageId === "subscribe") {
    await initializeSubscribeScreen();
  }

  if (pageId === "payment-success") {
    await initializeSubscriptionSuccessScreen();
  }

  if (pageId === "subscription-cancel") {
    await initializeSubscriptionCancelScreen();
  }
}

// CLOSE initializeScreen HERE

/**
 * Set up screen initialization callback for navigation
 */
export function navigateToPage(pageId) {
  const safePage = String(pageId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safePage) return;

  const nextHash = `#${safePage}`;

  // Clear scroll position from history to prevent browser restoration
  window.history.replaceState(window.history.state, '', window.location.href);

  // If hash is unchanged, hashchange will not fire, so render directly.
  if (window.location.hash === nextHash) {
    showPage(safePage);
    return;
  }

  window.location.hash = safePage;
  showPage(safePage);
}

function setupScreenInitialization() {
  // Expose globally for onclick handlers and navigation
  window.showPage = navigateToPage;

  // Set up navigation event delegation
  document.addEventListener('click', (e) => {
    const pageLink = e.target.closest('[data-page]');
    if (pageLink) {
      const pageId = pageLink.getAttribute('data-page');
      const tabKey = pageLink.getAttribute('data-admin-tab');
      const href = pageLink.getAttribute('href') || '';

      if (tabKey) {
        sessionStorage.setItem('adminDashboardActiveTab', tabKey);
      }

      // Handle hash links via SPA router to avoid native anchor scroll retention.
      if (href.startsWith('#')) {
        e.preventDefault();

        if (pageId) {
          navigateToPage(pageId);
        }
        return;
      }

      // Fallback for non-anchor or non-hash navigation triggers.
      e.preventDefault();
      if (pageId) {
        navigateToPage(pageId);
      }
      return;
    }

    if (e.target.id === "logoutLink" || e.target.closest("#logoutLink")) {
      e.preventDefault();
      handleLogout();
    }
  });

}

// Global functions for programmatic access
window.showLogin = () => {
  navigateToPage('login');
  setTimeout(() => toggleAuthForm('login'), 100);
};

window.showSignup = () => {
  navigateToPage('login');
  setTimeout(() => toggleAuthForm('signup'), 100);
};
window.handleLogout = handleLogout;
window.handleLockedChapter = handleLockedChapter;
window.handleLockedWorksheet = handleLockedWorksheet;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ===== Navbar Mobile Toggle =====
function setupMobileNavToggle() {
  const navToggle = document.getElementById("navToggle");
  const navRight = document.getElementById("navRight");

  if (!navToggle || !navRight) return;

  const closeMobileMenu = () => {
    navRight.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  navToggle.addEventListener("click", () => {
    navRight.classList.toggle("open");

    const isOpen = navRight.classList.contains("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  window.addEventListener("scroll", () => {
    if (window.innerWidth <= 768 && navRight.classList.contains("open")) {
      closeMobileMenu();
    }
  });
}

setupMobileNavToggle();