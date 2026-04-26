/** @jest-environment jsdom */

import { jest } from '@jest/globals';

// Top-level module dependency seams consumed by main.js helpers.
const getSupabaseClientMock = jest.fn();
const isSupabaseInitializedMock = jest.fn();
const initPageFromHashMock = jest.fn();
const showPageMock = jest.fn();
const setGlobalOnLoadCallbackMock = jest.fn();

const checkAuthStateMock = jest.fn();
const initAuthStateListenerMock = jest.fn();
const signInMock = jest.fn();
const signUpMock = jest.fn();
const signOutMock = jest.fn();
const getCurrentSessionMock = jest.fn();
const getSubscriberStatusMock = jest.fn();
const isCurrentUserAdminMock = jest.fn();
const getAllChaptersMock = jest.fn();
const deleteCommentByIdMock = jest.fn();
const updateCommentByIdMock = jest.fn();
const deleteUserByIdMock = jest.fn();

const initializeProfileScreenMock = jest.fn();
const initializeChaptersScreenMock = jest.fn();
const initializeChapterReaderScreenMock = jest.fn();
const handleLockedChapterMock = jest.fn();
const initializeWorksheetsScreenMock = jest.fn();
const handleLockedWorksheetMock = jest.fn();
const initializeAdminDashboardMock = jest.fn();

const initUIMock = jest.fn();
const toggleAuthFormMock = jest.fn();
const showMessageMock = jest.fn();
const updateDashboardUserInfoMock = jest.fn();

const waitForElementMock = jest.fn().mockResolvedValue(undefined);
const validateFormMock = jest.fn();
const sanitizeStringMock = jest.fn((value) => String(value).trim());

const fetchWorksheetMetadataMock = jest.fn();
const downloadWorksheetMock = jest.fn();

const startSubscriptionCheckoutMock = jest.fn();
const initializeSubscribeScreenMock = jest.fn();
const initializeSubscriptionSuccessScreenMock = jest.fn();
const initializeSubscriptionCancelScreenMock = jest.fn();

const createStripeCheckoutSessionMock = jest.fn();
const getResponsesByChapterMock = jest.fn();
const renderResponsesTableMock = jest.fn();
const initBookReaderMock = jest.fn();

// Keep import-time bootstrap from auto-running init() during tests.
Object.defineProperty(document, 'readyState', {
  configurable: true,
  get: () => 'loading',
});

jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: getSupabaseClientMock,
  isSupabaseInitialized: isSupabaseInitializedMock,
}));

jest.unstable_mockModule('../js/modules/navigation.js', () => ({
  initPageFromHash: initPageFromHashMock,
  showPage: showPageMock,
  setGlobalOnLoadCallback: setGlobalOnLoadCallbackMock,
}));

jest.unstable_mockModule('../js/modules/auth.js', () => ({
  checkAuthState: checkAuthStateMock,
  initAuthStateListener: initAuthStateListenerMock,
  signIn: signInMock,
  signUp: signUpMock,
  signOut: signOutMock,
  getCurrentSession: getCurrentSessionMock,
  getSubscriberStatus: getSubscriberStatusMock,
  isCurrentUserAdmin: isCurrentUserAdminMock,
  getAllChapters: getAllChaptersMock,
  deleteCommentById: deleteCommentByIdMock,
  updateCommentById: updateCommentByIdMock,
  deleteUserById: deleteUserByIdMock,
}));

jest.unstable_mockModule('../js/modules/profile.js', () => ({
  initializeProfileScreen: initializeProfileScreenMock,
}));

jest.unstable_mockModule('../js/modules/chapters.js', () => ({
  initializeChaptersScreen: initializeChaptersScreenMock,
  initializeChapterReaderScreen: initializeChapterReaderScreenMock,
  handleLockedChapter: handleLockedChapterMock,
}));

jest.unstable_mockModule('../js/modules/worksheets.js', () => ({
  initializeWorksheetsScreen: initializeWorksheetsScreenMock,
  handleLockedWorksheet: handleLockedWorksheetMock,
  fetchWorksheetMetadata: fetchWorksheetMetadataMock,
  downloadWorksheet: downloadWorksheetMock,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard.js', () => ({
  initializeAdminDashboard: initializeAdminDashboardMock,
}));

jest.unstable_mockModule('../js/modules/ui.js', () => ({
  initUI: initUIMock,
  toggleAuthForm: toggleAuthFormMock,
  showMessage: showMessageMock,
  updateDashboardUserInfo: updateDashboardUserInfoMock,
}));

jest.unstable_mockModule('../js/utils/dom.js', () => ({
  waitForElement: waitForElementMock,
}));

jest.unstable_mockModule('../js/utils/validators.js', () => ({
  validateForm: validateFormMock,
  sanitizeString: sanitizeStringMock,
}));

jest.unstable_mockModule('../js/modules/subscription.js', () => ({
  startSubscriptionCheckout: startSubscriptionCheckoutMock,
  initializeSubscribeScreen: initializeSubscribeScreenMock,
  initializeSubscriptionSuccessScreen: initializeSubscriptionSuccessScreenMock,
  initializeSubscriptionCancelScreen: initializeSubscriptionCancelScreenMock,
}));

jest.unstable_mockModule('../js/modules/checkout.js', () => ({
  createStripeCheckoutSession: createStripeCheckoutSessionMock,
}));

jest.unstable_mockModule('../js/adminResponses.helpers.js', () => ({
  getResponsesByChapter: getResponsesByChapterMock,
  renderResponsesTable: renderResponsesTableMock,
}));

jest.unstable_mockModule('../js/modules/bookreader.js', () => ({
  initBookReader: initBookReaderMock,
}));

jest.unstable_mockModule('../js/config.js', () => ({
  APP_CONFIG: {
    FREE_CHAPTER_COUNT: 2,
  },
}));

const {
  syncScreenStyles,
  navigateToPage,
  handleLogin,
  handleSignup,
  handleLogout,
  handleWorksheetUpload,
  initializeScreen,
} = await import('../js/main.js');

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

async function bootstrapMainWithImmediateTimer(client = null) {
  const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    callback();
    return 0;
  });

  getSupabaseClientMock.mockReturnValue(client);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flushAsyncWork();

  setTimeoutSpy.mockRestore();
}

// Unit-style helper tests: validation, sanitization, and upload cleanup paths.
describe('main.js exported helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = '#home';
    window.alert = jest.fn();

    validateFormMock.mockReturnValue({ isValid: true, errors: {} });
    signInMock.mockResolvedValue({ success: true, message: 'Signed in' });
    signUpMock.mockResolvedValue({ success: true, message: 'Signed up' });
    signOutMock.mockResolvedValue({ success: true });
    getCurrentSessionMock.mockResolvedValue({ user: { id: 'u1', email: 'u1@example.com' } });
    isCurrentUserAdminMock.mockResolvedValue(false);
    getSupabaseClientMock.mockReturnValue(null);
  });

  // Verifies dynamic stylesheet injection for themed screens and cleanup on exit.
  test('syncScreenStyles adds/removes dynamic screen stylesheet', () => {
    syncScreenStyles('bookreader');
    const link = document.getElementById('active-screen-style');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('screens/bookreader.css');

    syncScreenStyles('home');
    expect(document.getElementById('active-screen-style')).toBeNull();
  });

  // Verifies route sanitization and same-hash fallback render behavior.
  test('navigateToPage sanitizes route ids and handles same-hash navigation', () => {
    navigateToPage('home<script>');
    expect(window.location.hash).toBe('#homescript');
    expect(showPageMock).toHaveBeenCalledWith('homescript');

    showPageMock.mockClear();
    navigateToPage('homescript');
    expect(showPageMock).toHaveBeenCalledWith('homescript');
  });

  // Verifies invalid route input is sanitized to empty and ignored.
  test('navigateToPage ignores empty sanitized routes', () => {
    window.location.hash = '#home';
    showPageMock.mockClear();

    navigateToPage('!!!');

    expect(window.location.hash).toBe('#home');
    expect(showPageMock).not.toHaveBeenCalled();
  });

  // Verifies global login/signup helpers route to the login page and switch the form.
  test('window.showLogin and window.showSignup switch auth forms', () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });

    window.showLogin();
    expect(showPageMock).toHaveBeenCalledWith('login');
    expect(toggleAuthFormMock).toHaveBeenCalledWith('login');

    showPageMock.mockClear();
    toggleAuthFormMock.mockClear();

    window.showSignup();
    expect(showPageMock).toHaveBeenCalledWith('login');
    expect(toggleAuthFormMock).toHaveBeenCalledWith('signup');

    setTimeoutSpy.mockRestore();
  });

  // Verifies login exits early on validation failure without auth call.
  test('handleLogin shows validation error and does not call signIn', async () => {
    document.body.innerHTML = `
      <form id="loginForm">
        <input id="loginEmail" value="bad-email" />
        <input id="loginPassword" value="123" />
        <button id="loginBtn" type="submit">Sign In</button>
      </form>
      <div id="loginMessage"></div>
    `;

    validateFormMock.mockReturnValueOnce({
      isValid: false,
      errors: { email: 'Please enter a valid email.' },
    });

    await handleLogin(document.getElementById('loginForm'));

    expect(signInMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith('loginMessage', 'Please enter a valid email.', 'error');
  });

  // Verifies signup exits early on validation failure without auth call.
  test('handleSignup shows validation error and does not call signUp', async () => {
    document.body.innerHTML = `
      <form id="signupForm">
        <input id="signupFirstName" value="A" />
        <input id="signupLastName" value="B" />
        <input id="signupEmail" value="bad" />
        <input id="signupPassword" value="short" />
        <input id="signupParent" type="checkbox" />
        <button id="signupBtn" type="submit">Create Account</button>
      </form>
      <div id="signupMessage"></div>
    `;

    validateFormMock.mockReturnValueOnce({
      isValid: false,
      errors: { password: 'Password is too short.' },
    });

    await handleSignup(document.getElementById('signupForm'));

    expect(signUpMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith('signupMessage', 'Password is too short.', 'error');
  });

  // Verifies logout error handling surfaces failures to users.
  test('handleLogout reports sign-out errors', async () => {
    signOutMock.mockRejectedValueOnce(new Error('sign out failed'));

    await handleLogout();

    expect(window.alert).toHaveBeenCalledWith('Error signing out: sign out failed');
  });

  // Verifies upload flow removes stored file when DB insert fails.
  test('handleWorksheetUpload validates file type and cleans up on DB insert failure', async () => {
    const removeMock = jest.fn().mockResolvedValue({ error: null });
    const uploadMock = jest.fn().mockResolvedValue({ error: null });
    const insertMock = jest.fn().mockResolvedValue({ error: new Error('db insert failed') });

    getSupabaseClientMock.mockReturnValue({
      storage: {
        from: jest.fn((bucket) => ({
          upload: uploadMock,
          remove: removeMock,
          bucket,
        })),
      },
      from: jest.fn(() => ({ insert: insertMock })),
    });

    document.body.innerHTML = `
      <form id="uploadWorksheetForm">
        <input id="worksheetTitle" value="Worksheet 1" />
        <textarea id="worksheetDescription">Desc</textarea>
        <select id="documentType"><option value="worksheet" selected>worksheet</option></select>
        <input id="chapterNumber" value="1" />
        <select id="accessLevel"><option value="public" selected>public</option></select>
        <input id="releaseDate" value="2026-04-10" />
        <input id="worksheetFile" type="file" />
        <button type="submit">Upload</button>
      </form>
      <div id="uploadMessage"></div>
    `;

    const fileInput = document.getElementById('worksheetFile');
    const pdfFile = new File(['pdf'], 'worksheet.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [pdfFile],
    });

    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456789);
    await handleWorksheetUpload(document.getElementById('uploadWorksheetForm'));
    dateNowSpy.mockRestore();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(['123456789-worksheet.pdf']);
    expect(document.getElementById('uploadMessage').textContent).toContain('db insert failed');
  });

  // Verifies the DOMContentLoaded bootstrap path executes the initial app setup.
  test('DOMContentLoaded bootstraps the app when document is loading', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });

    document.body.innerHTML = '<div id="year"></div>';
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(initUIMock).toHaveBeenCalledTimes(1);
    expect(setGlobalOnLoadCallbackMock).toHaveBeenCalledWith(initializeScreen);
    expect(initPageFromHashMock).toHaveBeenCalledTimes(1);
    expect(checkAuthStateMock).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });
});

// Route-focused tests for the highest-value initializeScreen branches.
describe('initializeScreen routing branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = '#home';

    isCurrentUserAdminMock.mockResolvedValue(false);
    getCurrentSessionMock.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } });
    getSupabaseClientMock.mockReturnValue(null);
  });

  // Verifies admin route denies non-admins and initializes dashboard for admins.
  test('admin-dashboard renders access denied for non-admin and initializes for admin', async () => {
    document.body.innerHTML = `
      <div id="adminNavItem"></div>
      <div id="pageContainer"></div>
    `;

    isCurrentUserAdminMock.mockResolvedValueOnce(false);
    await initializeScreen('admin-dashboard');
    expect(document.getElementById('pageContainer').textContent).toContain('Access Denied');
    expect(initializeAdminDashboardMock).not.toHaveBeenCalled();

    document.getElementById('pageContainer').innerHTML = '';
    isCurrentUserAdminMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    await initializeScreen('admin-dashboard');
    expect(initializeAdminDashboardMock).toHaveBeenCalledTimes(1);
  });

  // Verifies payment confirmation route redirects anonymous users to login.
  test('payment-confirmation redirects unauthenticated users to login', async () => {
    document.body.innerHTML = '<div id="adminNavItem"></div>';
    getCurrentSessionMock.mockResolvedValueOnce(null);

    await initializeScreen('payment-confirmation');

    expect(sessionStorage.getItem('returnTo')).toBe('#payment-confirmation');
    expect(window.location.hash).toBe('#login');
  });

  // Verifies login route wires signup/login link click handlers.
  test('login route binds auth-form toggle links', async () => {
    document.body.innerHTML = `
      <div id="adminNavItem"></div>
      <div id="loginBox"></div>
      <a id="signupSwitchLink" href="#">Signup</a>
      <a id="loginSwitchLink" href="#">Login</a>
    `;

    await initializeScreen('login');

    document.getElementById('signupSwitchLink').click();
    document.getElementById('loginSwitchLink').click();

    expect(toggleAuthFormMock).toHaveBeenCalledWith('signup');
    expect(toggleAuthFormMock).toHaveBeenCalledWith('login');
  });

  // Verifies login route gracefully handles missing login-box wait failures.
  test('login route handles waitForElement failure', async () => {
    document.body.innerHTML = '<div id="adminNavItem"></div>';
    waitForElementMock.mockRejectedValueOnce(new Error('login box missing'));

    await initializeScreen('login');

    expect(toggleAuthFormMock).not.toHaveBeenCalled();
  });

  // Verifies simple page routes invoke their corresponding initializers.
  test('chapters, worksheets, subscribe, and subscription-cancel routes initialize modules', async () => {
    document.body.innerHTML = '<div id="adminNavItem"></div>';

    await initializeScreen('chapters');
    await initializeScreen('worksheets');
    await initializeScreen('subscribe');
    await initializeScreen('subscription-cancel');

    expect(initializeChaptersScreenMock).toHaveBeenCalledTimes(1);
    expect(initializeWorksheetsScreenMock).toHaveBeenCalledTimes(1);
    expect(initializeSubscribeScreenMock).toHaveBeenCalledTimes(1);
    expect(initializeSubscriptionCancelScreenMock).toHaveBeenCalledTimes(1);
  });

  // Verifies payment-success polls subscription state and calls success initializer.
  test('payment-success route refreshes session, updates status, and initializes success screen', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });

    const refreshSessionMock = jest.fn().mockResolvedValue({});
    getSupabaseClientMock.mockReturnValue({ auth: { refreshSession: refreshSessionMock } });
    getSubscriberStatusMock.mockResolvedValueOnce({ isSubscriber: true });

    document.body.innerHTML = `
      <div id="adminNavItem"></div>
      <div id="paymentSuccessStatus"></div>
    `;

    await initializeScreen('payment-success');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(getSubscriberStatusMock).toHaveBeenCalled();
    expect(document.getElementById('paymentSuccessStatus').textContent).toContain('subscription is active');
    expect(initializeSubscriptionSuccessScreenMock).toHaveBeenCalledTimes(1);

    setTimeoutSpy.mockRestore();
  });

  // Verifies admin-responses route builds chapter options and renders table on chapter selection.
  test('admin-responses route populates dropdown and handles chapter selection', async () => {
    isCurrentUserAdminMock.mockResolvedValue(true);
    getAllChaptersMock.mockResolvedValue({ success: true, data: [{ id: 1 }, { id: 2 }] });
    getResponsesByChapterMock.mockResolvedValue({ success: true, data: [{ id: 'r1' }] });

    document.body.innerHTML = `
      <div id="adminNavItem"></div>
      <select id="chapterSelect"></select>
      <div id="responsesContainer"></div>
      <div id="adminResponsesMessage"></div>
      <div id="chapterDropdown" class="custom-dropdown">
        <button id="chapterDropdownTrigger" type="button">Choose</button>
        <div id="chapterDropdownMenu"></div>
      </div>
    `;

    await initializeScreen('admin-responses');

    expect(document.getElementById('chapterSelect').options.length).toBe(3);
    expect(document.getElementById('responsesContainer').textContent).toContain('No chapter selected yet.');

    document.getElementById('chapterDropdownTrigger').click();
    const option = document.querySelector('.custom-dropdown__option[data-value="1"]');
    option.click();
    await flushAsyncWork();

    expect(getResponsesByChapterMock).toHaveBeenCalledWith('1');
    expect(renderResponsesTableMock).toHaveBeenCalled();
  });

  // Verifies chapter-reader route renders worksheet metadata and skips legacy reader initializer.
  test('chapter-reader route renders worksheet list from metadata', async () => {
    fetchWorksheetMetadataMock.mockResolvedValue({
      success: true,
      data: [{ id: 'w1', title: 'Worksheet 1', description: 'Desc' }],
    });

    document.body.innerHTML = `
      <div id="adminNavItem"></div>
      <div id="chapterTitle"></div>
      <div id="worksheetsContainer"></div>
    `;

    await initializeScreen('chapter-reader');

    const wsBox = document.getElementById('worksheetsContainer');
    expect(fetchWorksheetMetadataMock).toHaveBeenCalledWith({ includeAnswerKeys: true });
    expect(wsBox.innerHTML).toContain('Worksheet 1');
    expect(wsBox.dataset.loaded).toBe('true');
    expect(initializeChapterReaderScreenMock).not.toHaveBeenCalled();
  });

  // Verifies bookreader route runs feature initializer.
  test('bookreader branch initializes book reader module', async () => {
    document.body.innerHTML = '<div id="adminNavItem"></div>';

    await initializeScreen('bookreader');

    expect(initBookReaderMock).toHaveBeenCalledTimes(1);
  });

  // Verifies dashboard route waits for DOM anchors and populates user info.
  test('dashboard branch updates user info when session exists', async () => {
    document.body.innerHTML = '<div id="adminNavItem"></div><div id="userName"></div><div id="userEmail"></div>';

    await initializeScreen('dashboard');

    expect(waitForElementMock).toHaveBeenCalledWith('#userName', 1000);
    expect(waitForElementMock).toHaveBeenCalledWith('#userEmail', 1000);
    expect(updateDashboardUserInfoMock).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.com' });
  });

  // Verifies legacy worksheet-reader path redirects through worksheets route.
  test('worksheet-reader redirects and uses legacy worksheet id flow', async () => {
    document.body.innerHTML = '<div id="adminNavItem"></div>';
    sessionStorage.setItem('activeWorksheetId', 'w-33');

    await initializeScreen('worksheet-reader');

    expect(handleLockedWorksheetMock).toHaveBeenCalledWith('w-33');
    expect(sessionStorage.getItem('activeWorksheetId')).toBeNull();
    expect(window.location.hash).toBe('#worksheets');
  });

  // Verifies the mobile nav toggle registers open/close behavior when elements exist at import time.
  test('mobile nav toggle opens and closes on scroll in a fresh module import', async () => {
    const originalReadyState = Object.getOwnPropertyDescriptor(document, 'readyState');
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });
    const originalInnerWidth = window.innerWidth;

    document.body.innerHTML = `
      <button id="navToggle" aria-expanded="false" type="button"></button>
      <nav id="navRight" class=""></nav>
      <div id="adminNavItem"></div>
    `;
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
      writable: true,
    });

    await jest.isolateModulesAsync(async () => {
      await import('../js/main.js');
    });

    const navToggle = document.getElementById('navToggle');
    const navRight = document.getElementById('navRight');

    navToggle.click();
    expect(navRight.classList.contains('open')).toBe(true);
    expect(navToggle.getAttribute('aria-expanded')).toBe('true');

    window.dispatchEvent(new Event('scroll'));
    expect(navRight.classList.contains('open')).toBe(false);
    expect(navToggle.getAttribute('aria-expanded')).toBe('false');

    if (originalReadyState) {
      Object.defineProperty(document, 'readyState', originalReadyState);
    }
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
    setTimeoutSpy.mockRestore();
  });
});

describe('main.js bootstrap and delegated events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = '#home';
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => 'Updated response');

    validateFormMock.mockReturnValue({ isValid: true, errors: {} });
    signInMock.mockResolvedValue({ success: true, message: 'Signed in' });
    signOutMock.mockResolvedValue({ success: true });
    createStripeCheckoutSessionMock.mockResolvedValue({ success: false, message: 'Stripe unavailable' });
    updateCommentByIdMock.mockResolvedValue({ success: true });
    deleteCommentByIdMock.mockResolvedValue({ success: true });
    deleteUserByIdMock.mockResolvedValue({ success: true });
    getCurrentSessionMock.mockResolvedValue({ user: { id: 'u1', email: 'user@example.com' } });
    isCurrentUserAdminMock.mockResolvedValue(false);
  });

  // Verifies bootstrap checks auth state and auth-listener refreshes profile only on profile route.
  test('bootstrap wires auth state and profile listener behavior', async () => {
    document.body.innerHTML = '<div id="year"></div>';

    await bootstrapMainWithImmediateTimer({ auth: { refreshSession: jest.fn() } });

    expect(checkAuthStateMock).toHaveBeenCalled();
    expect(initAuthStateListenerMock).toHaveBeenCalled();

    const listener = initAuthStateListenerMock.mock.calls.at(-1)[0];
    expect(typeof listener).toBe('function');

    initializeProfileScreenMock.mockClear();
    window.location.hash = '#home';
    await listener('SIGNED_IN');
    expect(initializeProfileScreenMock).not.toHaveBeenCalled();

    window.location.hash = '#profile';
    await listener('SIGNED_IN');
    expect(initializeProfileScreenMock).toHaveBeenCalledTimes(1);

    await listener('SIGNED_OUT');
    expect(initializeProfileScreenMock).toHaveBeenCalledTimes(2);
  });

  // Verifies global admin menu click listener updates tab state, active button, and hash.
  test('admin-menu button click updates active state and route hash', () => {
    document.body.innerHTML = `
      <button class="admin-menu-btn active" data-admin-tab="chapters" data-page="admin-dashboard">Chapters</button>
      <button class="admin-menu-btn" data-admin-tab="users" data-page="admin-upload">Users</button>
    `;

    const [firstBtn, secondBtn] = document.querySelectorAll('.admin-menu-btn');
    secondBtn.click();

    expect(sessionStorage.getItem('adminDashboardActiveTab')).toBe('users');
    expect(firstBtn.classList.contains('active')).toBe(false);
    expect(secondBtn.classList.contains('active')).toBe(true);
    expect(window.location.hash).toBe('#admin-upload');
  });

  // Verifies submit/click delegated handlers run login, route navigation, and payment-failure paths.
  test('delegated submit and click handlers process login, navigation, and failed checkout', async () => {
    document.body.innerHTML = '<div id="year"></div>';
    await bootstrapMainWithImmediateTimer(null);

    const navLink = document.createElement('a');
    navLink.setAttribute('data-page', 'chapters');
    navLink.setAttribute('href', '#chapters');
    navLink.setAttribute('data-admin-tab', 'chapters');
    navLink.textContent = 'Go to chapters';
    document.body.appendChild(navLink);

    navLink.click();
    expect(showPageMock).toHaveBeenCalledWith('chapters');
    expect(sessionStorage.getItem('adminDashboardActiveTab')).toBe('chapters');

    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <form id="loginForm">
        <input id="loginEmail" value="reader@example.com" />
        <input id="loginPassword" value="password123" />
        <button id="loginBtn" type="submit">Sign In</button>
      </form>
      <div id="loginMessage"></div>
      <button id="select-free-plan" type="button">Free</button>
      <button id="select-paid-plan" type="button">Paid</button>
      <button id="confirmPaymentBtn" type="button">Confirm</button>
    `
    );

    sessionStorage.setItem('returnTo', '#subscribe');
    document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsyncWork();
    expect(signInMock).toHaveBeenCalledWith('reader@example.com', 'password123');
    expect(sessionStorage.getItem('returnTo')).toBeNull();

    getCurrentSessionMock.mockResolvedValue(null);
    document.getElementById('select-paid-plan').click();
    await flushAsyncWork();
    expect(window.location.hash).toBe('#login');
    expect(sessionStorage.getItem('returnTo')).toBe('#payment-confirmation');

    document.getElementById('select-free-plan').click();
    await flushAsyncWork();
    expect(window.location.hash).toBe('#login');
    expect(sessionStorage.getItem('returnTo')).toBe('#home');

    document.getElementById('confirmPaymentBtn').click();
    await flushAsyncWork();
    expect(createStripeCheckoutSessionMock).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('Stripe unavailable');
  });

  // Verifies setupScreenInitialization logout-link branch calls handleLogout through delegated click.
  test('delegated logout-link click calls signOut', async () => {
    document.body.innerHTML = `
      <div id="year"></div>
      <a id="logoutLink" href="#">Logout</a>
    `;

    await bootstrapMainWithImmediateTimer(null);

    document.getElementById('logoutLink').click();
    await flushAsyncWork();

    expect(signOutMock).toHaveBeenCalled();
  });

  // Verifies delegated admin response/user actions update DOM and enforce admin-delete guardrails.
  test('delegated admin action buttons handle response edits/deletes and user restrictions', async () => {
    document.body.innerHTML = `
      <div id="year"></div>
      <div id="responsesContainer">
        <table>
          <tbody>
            <tr data-comment-id="c-1">
              <td>User A</td>
              <td>Original response</td>
              <td>
                <button class="edit-response-btn" data-id="c-1">Edit</button>
                <button class="delete-response-btn" data-id="c-1">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <table>
        <tbody>
          <tr id="admin-user-row">
            <td>admin-1</td>
            <td>admin</td>
            <td><button class="delete-user-btn" data-id="admin-1">Delete User</button></td>
          </tr>
          <tr id="free-user-row">
            <td>free-1</td>
            <td>free</td>
            <td><button class="delete-user-btn" data-id="free-1">Delete User</button></td>
          </tr>
        </tbody>
      </table>
    `;

    await bootstrapMainWithImmediateTimer(null);

    // main.js reads role via innerText, so set it explicitly for JSDOM parity.
    document.querySelector('#admin-user-row').children[1].innerText = 'admin';
    document.querySelector('#free-user-row').children[1].innerText = 'free';

    document.querySelector('.edit-response-btn').click();
    await flushAsyncWork();
    expect(updateCommentByIdMock).toHaveBeenCalledWith('c-1', 'Updated response');
    expect(document.querySelector('tr[data-comment-id="c-1"]').children[1].innerText).toBe('Updated response');

    document.querySelector('.delete-response-btn').click();
    await flushAsyncWork();
    expect(deleteCommentByIdMock).toHaveBeenCalledWith('c-1');
    expect(document.getElementById('responsesContainer').textContent).toContain('No responses submitted yet.');

    document.querySelector('#admin-user-row .delete-user-btn').click();
    await flushAsyncWork();
    expect(window.alert).toHaveBeenCalledWith('You cannot delete an admin account.');

    document.querySelector('#free-user-row .delete-user-btn').click();
    await flushAsyncWork();
    expect(deleteUserByIdMock).toHaveBeenCalledWith('free-1');
  });
});
