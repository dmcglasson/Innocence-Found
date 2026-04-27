import { jest } from "@jest/globals";

jest.unstable_mockModule("../js/modules/navigation.js", () => ({
  showPage: jest.fn()
}));

const {
  initUI,
  updateNavForLoggedIn,
  updateNavForLoggedOut,
  updateDashboardUserInfo,
  showMessage,
  clearMessage,
  toggleAuthForm
} = await import("../js/modules/ui.js");

describe("UI Module Tests", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("initUI initializes nav elements and updateNavForLoggedIn displays user menu", () => {
    document.body.innerHTML = `
      <span id="userNameNav"></span>
      <div id="userMenu" style="display:none"></div>
      <div id="authNavItem" style="display:block"></div>
      <a id="loginNavLink"></a>
    `;

    initUI();

    updateNavForLoggedIn({
      email: "mandee@example.com",
      user_metadata: { name: "Mandee" }
    });

    expect(document.getElementById("userNameNav").textContent).toBe("Mandee");
    expect(document.getElementById("userMenu").style.display).toBe("flex");
    expect(document.getElementById("authNavItem").style.display).toBe("none");
  });

  test("updateNavForLoggedIn falls back to email username", () => {
    document.body.innerHTML = `
      <span id="userNameNav"></span>
      <div id="userMenu"></div>
      <div id="authNavItem"></div>
      <a id="loginNavLink"></a>
    `;

    initUI();

    updateNavForLoggedIn({
      email: "student@example.com",
      user_metadata: {}
    });

    expect(document.getElementById("userNameNav").textContent).toBe("student");
  });

  test("updateNavForLoggedOut hides user menu and shows auth nav", () => {
    document.body.innerHTML = `
      <div id="userMenu" style="display:flex"></div>
      <div id="authNavItem" style="display:none"></div>
    `;

    initUI();

    updateNavForLoggedOut();

    expect(document.getElementById("userMenu").style.display).toBe("none");
    expect(document.getElementById("authNavItem").style.display).toBe("block");
  });

  test("updateDashboardUserInfo updates dashboard name and email", () => {
    document.body.innerHTML = `
      <div id="userName"></div>
      <div id="userEmail"></div>
    `;

    updateDashboardUserInfo({
      email: "mandee@example.com",
      user_metadata: { name: "Mandee Jauregui" }
    });

    expect(document.getElementById("userName").textContent).toBe("Mandee Jauregui");
    expect(document.getElementById("userEmail").textContent).toBe("mandee@example.com");
  });

  test("showMessage displays message with type class", () => {
    document.body.innerHTML = `<div id="loginMessage"></div>`;

    showMessage("loginMessage", "Login failed", "error");

    const message = document.getElementById("loginMessage");

    expect(message.textContent).toBe("Login failed");
    expect(message.className).toBe("message error");
  });

  test("clearMessage clears text and resets class", () => {
    document.body.innerHTML = `<div id="msg" class="message error">Error</div>`;

    clearMessage("msg");

    const message = document.getElementById("msg");

    expect(message.textContent).toBe("");
    expect(message.className).toBe("message");
  });

  test("toggleAuthForm shows login and hides signup", () => {
    document.body.innerHTML = `
      <div id="loginBox" style="display:none"></div>
      <div id="signupBox" style="display:block"></div>
      <div id="loginMessage">Old message</div>
      <form id="loginForm">
        <input name="email" value="test@example.com" />
      </form>
    `;

    toggleAuthForm("login");

    expect(document.getElementById("loginBox").style.display).toBe("block");
    expect(document.getElementById("signupBox").style.display).toBe("none");
    expect(document.getElementById("loginMessage").textContent).toBe("");
  });

  test("toggleAuthForm shows signup and hides login", () => {
    document.body.innerHTML = `
      <div id="loginBox" style="display:block"></div>
      <div id="signupBox" style="display:none"></div>
      <div id="signupMessage">Old message</div>
      <form id="signupForm">
        <input name="name" value="Mandee" />
      </form>
    `;

    toggleAuthForm("signup");

    expect(document.getElementById("loginBox").style.display).toBe("none");
    expect(document.getElementById("signupBox").style.display).toBe("block");
    expect(document.getElementById("signupMessage").textContent).toBe("");
  });

  test("toggleAuthForm safely returns when boxes are missing", () => {
    document.body.innerHTML = "";

    expect(() => toggleAuthForm("login")).not.toThrow();
  });
});