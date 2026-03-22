/**
 * Main Application Entry Point
 * 
 * This file initializes the application and sets up all modules.
 * It coordinates between different modules and handles the application lifecycle.
 */

import { initPageFromHash, showPage, setGlobalOnLoadCallback, initMobileNav } from './modules/navigation.js';
import { checkAuthState, initAuthStateListener, signIn, signUp, signOut, getCurrentSession, getSubscriberStatus, isCurrentUserAdmin, getAllChapters, getCommentsByChapter, deleteCommentById, updateCommentById } from './modules/auth.js';
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from './modules/ui.js';
import { waitForElement } from './utils/dom.js';
import { validateForm, sanitizeString } from './utils/validators.js';
import { fetchWorksheetMetadata, downloadWorksheet } from "./modules/worksheets.js";
import { APP_CONFIG } from './config.js';

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
    console.error("Failed to initialize Supabase client. Check your .env file or config.");
    // Show user-friendly error
    const pageContainer = document.getElementById("pageContainer");
    if (pageContainer) {
      pageContainer.innerHTML = `
        <div class="content-section">
          <h2>Configuration Error</h2>
          <p>Supabase credentials not configured. Please:</p>
          <ol>
            <li>Create a <code>.env</code> file (copy from <code>.env.example</code>)</li>
            <li>Add your <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code></li>
            <li>Refresh this page</li>
          </ol>
        </div>
      `;
    }
    return;
  }

  // Initialize UI
  initUI();
  initMobileNav();
  setGlobalOnLoadCallback(initializeScreen);

  // Initialize page from URL hash
  await initPageFromHash();

  // Initialize auth state listener
  initAuthStateListener();

  // Set up event listeners
  setupEventListeners();

  // Set up screen initialization callback
  setupScreenInitialization();

}

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

    // Download worksheet
    const dlBtn = e.target.closest && e.target.closest(".downloadWorksheetBtn");
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
async function handleLogin(form) {
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
      setTimeout(() => {
        const returnTo = sessionStorage.getItem('returnTo');

        if (returnTo) {
          sessionStorage.removeItem('returnTo');
          window.location.hash = returnTo.replace(/^#/, '');
        } else {
          window.location.hash = 'chapters';
        }
      }, 1000);
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
async function handleSignup(form) {
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

async function handleWorksheetUpload(form) {
  const titleInput = form.querySelector('#worksheetTitle');
  const descriptionInput = form.querySelector('#worksheetDescription');
  const fileInput = form.querySelector('#worksheetFile');
  const uploadMsg = document.getElementById('uploadMessage');
  const uploadBtn = form.querySelector('button[type="submit"]');

  const file = fileInput.files?.[0];

  if (!file) {
    if (uploadMsg) uploadMsg.textContent = 'Please choose a PDF file.';
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';

  try {
    const supabase = getSupabaseClient();

    const safeFileName = `${Date.now()}-${file.name}`;

    const { error: storageError } = await supabase.storage
      .from('Worksheets')
      .upload(safeFileName, file);

    if (storageError) throw storageError;

    const { error: dbError } = await supabase
      .from('worksheets')
      .insert([{
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        file_path: safeFileName
      }]);

    if (dbError) throw dbError;

    if (uploadMsg) uploadMsg.textContent = 'Upload successful!';
    form.reset();

  } catch (err) {
    if (uploadMsg) uploadMsg.textContent = err.message || 'Upload failed';
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Worksheet';
  }
}
/**
 * Handle logout
 */
async function handleLogout() {

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

/**
 * Initialize screen-specific logic after screen loads
 * @param {string} pageId - ID of the loaded page
 */
/**
 * Initialize screen-specific logic after screen loads
 * @param {string} pageId - ID of the loaded page
 */
async function initializeScreen(pageId) {
  // Dashboard screen
  if (pageId === 'dashboard') {
    try {
      await waitForElement('#userName', 1000);
      await waitForElement('#userEmail', 1000);

      const session = await getCurrentSession();
      if (session && session.user) {
        updateDashboardUserInfo(session.user);
      }
    } catch (error) {
      console.warn('Dashboard elements not found:', error);

    }
  }

  if (pageId === 'admin-responses') {
    const isAdmin = await isCurrentUserAdmin();

    if (!isAdmin) {
      const pageContainer = document.getElementById('pageContainer');
      if (pageContainer) {
        pageContainer.innerHTML = `
        <div class="content-section">
          <div class="auth-box">
            <h2>Access Denied</h2>
            <p>This page is for admins only.</p>
          </div>
        </div>
      `;
      }
      return;
    }

    await waitForElement('#chapterSelect', 1000);
    await waitForElement('#responsesContainer', 1000);

    const chapterSelect = document.getElementById('chapterSelect');
    const responsesContainer = document.getElementById('responsesContainer');
    const messageEl = document.getElementById('adminResponsesMessage');

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

    chapterSelect.innerHTML = `<option value="">Choose a chapter</option>`;

    chaptersResult.data.forEach((chapter) => {
      const option = document.createElement('option');
      option.value = chapter.id;
      option.textContent = chapter.title || `Chapter ${chapter.id}`;
      chapterSelect.appendChild(option);
    });

    renderEmptyState('No chapter selected yet.');

    chapterSelect.addEventListener('change', async () => {
      const chapterId = chapterSelect.value;

      if (messageEl) messageEl.textContent = '';

      if (!chapterId) {
        renderEmptyState('No chapter selected yet.');
        return;
      }

      renderLoadingState();

      const commentsResult = await getCommentsByChapter(chapterId);

      if (!commentsResult.success) {
        if (messageEl) {
          messageEl.textContent = commentsResult.message || 'Unable to load responses.';
        }
        renderErrorState('Unable to load responses for this chapter.');
        return;
      }

      if (!commentsResult.data.length) {
        renderEmptyState('No responses submitted yet.');
        return;
      }

      responsesContainer.innerHTML = `
  <table class="responses-table">
    <thead>
      <tr>
        <th>User ID</th>
        <th>Response</th>
        <th>Timestamp</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${commentsResult.data.map((comment) => `
        <tr data-comment-id="${comment.id}">
          <td>${comment.uid ?? ''}</td>
          <td>${comment.message ?? ''}</td>
          <td>${comment.created_at ? new Date(comment.created_at).toLocaleDateString() : ''}</td>
          <td>
            <button type="button" class="action-btn edit-response-btn" data-id="${comment.id}">Edit</button>
            <button type="button" class="action-btn delete-response-btn" data-id="${comment.id}">Delete</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
`;
    });
  }

  if (pageId === 'chapter-reader') {
    await waitForElement('#chapterTitle', 1000);

    const chapterNumber = Number(sessionStorage.getItem('activeChapter'));

    // If someone goes to #chapter-reader directly without picking a chapter
    if (!chapterNumber) {
      window.location.hash = 'chapters';
      return;
    }

    if (chapterNumber > FREE_LIMIT) {
      const session = await getCurrentSession();

      // Not logged in -> send to login
      if (!session || !session.user) {
        sessionStorage.setItem('returnTo', 'chapters');
        sessionStorage.setItem('requestedChapter', String(chapterNumber));
        window.showLogin();
        return;
      }

      // Logged in but not subscriber -> block
      const subInfo = await getSubscriberStatus();
      if (!subInfo.isSubscriber) {
        alert('Subscribers only.');
        window.location.hash = 'chapters';
        return;
      }
    }

    // ===== Render chapter (your exact existing content) =====
    const titleEl = document.getElementById('chapterTitle');
    const bodyEl = document.getElementById('chapterBody');
    const backBtn = document.getElementById('backToChaptersBtn');

    if (titleEl) titleEl.textContent = `Chapter ${chapterNumber}`;

    if (bodyEl) {
      const mockChapters = {
        1: `
        <p><em>Chapter 1 — The Woods Behind the House</em></p>
        <p>
          The path behind the old fence was never meant for children. It began as a thin line in the grass,
          then faded into roots and wet soil, as if the forest was trying to erase it.
        </p>
        <p>
          Mara stepped carefully, listening. The world here sounded different—quieter, but not empty.
          Leaves moved without wind. A bird called once, then stopped like it remembered a rule.
        </p>
        <p>
          Halfway down the trail she found the first sign: a ribbon tied around a branch,
          pale and frayed, the kind people used to mark “safe” places.
        </p>
        <p>
          She reached out to touch it, and that’s when she noticed the initials stitched into the fabric:
          <strong>I.F.</strong>
        </p>
      `,
        2: `
        <p><em>Chapter 2 — A Letter With No Stamp</em></p>
        <p>
          The envelope appeared where it shouldn’t have—between the pages of a book she hadn’t opened in years.
          No stamp. No return address. Only her name written in careful, old-fashioned ink.
        </p>
        <p>
          She waited before tearing it open, as if patience could change what was inside.
          But curiosity always wins when fear has no shape.
        </p>
        <p>
          The letter was short, almost polite:
        </p>
        <p style="margin-left: 18px; border-left: 2px solid #d4af37; padding-left: 12px;">
          “If you want the truth, follow the path behind the house at dawn. Do not bring anyone.
          Do not look back until you reach the stones.”
        </p>
        <p>
          Mara read it twice. Then a third time, slower—because the last line felt less like advice
          and more like a warning written by someone who already knew what she would do.
        </p>
      `
      };

      bodyEl.innerHTML = mockChapters[chapterNumber] || `
      <p><em>Chapter ${chapterNumber}</em></p>
      <p>This chapter is not available in preview yet. Please check back later.</p>
    `;
    }

    if (backBtn) {
      backBtn.onclick = () => {
        window.location.hash = 'chapters';
      };
    }
  }

  // Login / Signup screen
  if (pageId === 'login') {
    try {
      // Wait for the auth boxes to exist
      await waitForElement('#loginBox', 1000);

      const signupLink = document.getElementById('signupSwitchLink');
      const loginLink = document.getElementById('loginSwitchLink');

      if (signupLink) {
        signupLink.addEventListener('click', (e) => {
          e.preventDefault();
          toggleAuthForm('signup');
        });
      }


      if (loginLink) {
        loginLink.addEventListener('click', (e) => {
          e.preventDefault();
          toggleAuthForm('login');
        });
      }
    } catch (error) {
      console.warn('Auth screen elements not found:', error);
    }
  }


  if (pageId === 'chapters') {
    await waitForElement('#chapterList', 1000);

    const session = await getCurrentSession();
    let isSubscriber = false;

    if (session && session.user) {
      const subInfo = await getSubscriberStatus();
      isSubscriber = subInfo.isSubscriber;
    }

    renderChapters({ isSubscriber });

    const requestedChapter = sessionStorage.getItem('requestedChapter');
    if (requestedChapter) {
      sessionStorage.removeItem('requestedChapter');
      handleLockedChapter(Number(requestedChapter));
    }
  }
}

/**
 * Set up screen initialization callback for navigation
 */
function setupScreenInitialization() {
  // Wrap showPage to include screen initialization
  const originalShowPage = showPage;
  const wrappedShowPage = async (pageId) => {
    await originalShowPage(pageId);
  };

  // Expose globally for onclick handlers and navigation
  window.showPage = wrappedShowPage;

  // Set up navigation event delegation
  document.addEventListener('click', (e) => {
    const pageLink = e.target.closest('[data-page]');
    if (pageLink) {
      e.preventDefault();
      const pageId = pageLink.getAttribute('data-page');
      if (pageId) {
        wrappedShowPage(pageId);
      }
    }

    // Handle logout link
    if (e.target.id === 'logoutLink' || e.target.closest('#logoutLink')) {
      e.preventDefault();
      handleLogout();
    }
  });
}

// Global functions for programmatic access
window.showLogin = () => {
  showPage('login').then(() => {
    setTimeout(() => toggleAuthForm('login'), 100);
  });
};
window.showSignup = () => {
  showPage('login').then(() => {
    setTimeout(() => toggleAuthForm('signup'), 100);
  });
};
window.handleLogout = handleLogout;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
function renderChapters({ isSubscriber = false } = {}) {
  const chapterList = document.getElementById("chapterList");
  if (!chapterList) return;

  let html = "";

  for (let i = 1; i <= APP_CONFIG.TOTAL_CHAPTERS; i++) {
    const isLocked = !isSubscriber && i > APP_CONFIG.FREE_CHAPTER_COUNT;
    html += `
      <div class="chapter-item">
        <h3>${isLocked ? "🔒 " : ""}Chapter ${i}</h3>
        <button 
  type="button" 
  class="chapter-button" 
  data-chapter="${i}"
>
  ${isLocked ? "Subscribers Only" : "Read for Free"}
</button>
      </div>
    `;
  }

  chapterList.innerHTML = html;
  //One click listener for all chapter buttons (no inline onclick)
  if (!chapterList.dataset.listenerAttached) {
    chapterList.addEventListener("click", (e) => {
      const btn = e.target.closest(".chapter-button");
      if (!btn) return;

      const chapterNumber = Number(btn.dataset.chapter);
      if (Number.isNaN(chapterNumber)) return;

      handleLockedChapter(chapterNumber);
    });

    chapterList.dataset.listenerAttached = "true";
  }
}

async function handleLockedChapter(chapterNumber) {
  // Chapters 1–2 are free
  const isFreeChapter = chapterNumber <= FREE_LIMIT;

  // Only require login for locked chapters (3+)
  if (!isFreeChapter) {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      sessionStorage.setItem('returnTo', '#chapters');
      sessionStorage.setItem('requestedChapter', String(chapterNumber));
      window.showLogin();
      return;
    }
  }

  // Open the chapter
  sessionStorage.setItem('activeChapter', String(chapterNumber));
  window.location.hash = 'chapter-reader';
}
window.handleLockedChapter = handleLockedChapter;

