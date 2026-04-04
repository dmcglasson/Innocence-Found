/** @jest-environment jsdom */

import { jest } from "@jest/globals";

const getCurrentSessionMock = jest.fn();
const updateUserMock = jest.fn();
const getSupabaseClientMock = jest.fn();

jest.unstable_mockModule("../js/modules/auth.js", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

jest.unstable_mockModule("../js/modules/supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

const { initializeProfileScreen } = await import("../js/modules/profile.js");

async function flushPromises(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function buildProfileDom() {
  document.body.innerHTML = `
    <div id="statusPanel" style="display:none;">
      <div id="statusMsg"></div>
    </div>

    <button id="tabBtnProfile" class="menu-item active" type="button">Edit profile</button>
    <button id="tabBtnPassword" class="menu-item" type="button">Change password</button>
    <button id="tabBtnPrefs" class="menu-item" type="button">Preferences</button>

    <section id="tab-profile"></section>
    <section id="tab-password" style="display:none;">
      <form id="passwordForm">
        <input id="newPasswordInput" type="password" />
        <button type="submit">Update Password</button>
      </form>
    </section>
    <section id="tab-preferences" style="display:none;">
      <form id="prefsForm">
        <input id="prefEmailUpdates" type="checkbox" />
        <button type="submit">Save Preferences</button>
      </form>
    </section>

    <div id="viewName"></div>
    <div id="viewName2"></div>
    <div id="viewEmail"></div>
    <div id="viewSubscription"></div>
    <div id="viewEnrolled"></div>

    <button id="editBtn" type="button">Edit</button>

    <form id="profileForm" style="display:none;">
      <input id="nameInput" />
      <div id="nameError" style="display:none;">Name is required.</div>

      <input id="toggleEmailEdit" type="checkbox" />
      <input id="emailInput" />
      <div id="emailError" style="display:none;">Enter a valid email address.</div>

      <button id="saveProfileBtn" type="submit">Save</button>
      <button id="cancelProfileBtn" type="button">Cancel</button>
    </form>
  `;
}

describe("initializeProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    buildProfileDom();

    getSupabaseClientMock.mockReturnValue({
      auth: {
        updateUser: updateUserMock,
      },
    });
  });

  test("renders signed-out fallback values when there is no user", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await initializeProfileScreen();

    expect(document.getElementById("viewName").textContent).toBe("Not signed in");
    expect(document.getElementById("viewName2").textContent).toBe("Not signed in");
    expect(document.getElementById("viewEmail").textContent).toBe("-");
    expect(document.getElementById("viewSubscription").textContent).toBe("Subscription: -");
    expect(document.getElementById("viewEnrolled").textContent).toBe("-");
  });

  test("renders user metadata, subscription, and editable field defaults", async () => {
    const createdAt = "2025-05-10T12:00:00.000Z";

    getCurrentSessionMock.mockResolvedValue({
      user: {
        email: "reader@example.com",
        created_at: createdAt,
        user_metadata: {
          first_name: "Ada",
          last_name: "Lovelace",
          subscriber: "true",
        },
      },
    });

    await initializeProfileScreen();

    const expectedDate = new Date(createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    expect(document.getElementById("viewName").textContent).toBe("Ada Lovelace");
    expect(document.getElementById("viewName2").textContent).toBe("Ada Lovelace");
    expect(document.getElementById("viewEmail").textContent).toBe("reader@example.com");
    expect(document.getElementById("viewSubscription").textContent).toBe("Subscription: Subscriber");
    expect(document.getElementById("viewEnrolled").textContent).toBe(expectedDate);
    expect(document.getElementById("nameInput").value).toBe("Ada Lovelace");
    expect(document.getElementById("emailInput").value).toBe("reader@example.com");
  });

  test("falls back to email when profile metadata name fields are missing", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: {
        email: "fallback@example.com",
        created_at: "invalid-date",
        user_metadata: {
          subscriber: false,
        },
      },
    });

    await initializeProfileScreen();

    expect(document.getElementById("viewName").textContent).toBe("fallback@example.com");
    expect(document.getElementById("viewSubscription").textContent).toBe("Subscription: Free");
    expect(document.getElementById("viewEnrolled").textContent).toBe("-");
    expect(document.getElementById("nameInput").value).toBe("fallback@example.com");
  });

  describe("initializeProfileScreen interactions", () => {
    test("initializes in profile tab with form hidden and email disabled", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
            subscriber: true,
          },
        },
      });

      await initializeProfileScreen();

      expect(document.getElementById("tab-profile").style.display).toBe("block");
      expect(document.getElementById("tab-password").style.display).toBe("none");
      expect(document.getElementById("tab-preferences").style.display).toBe("none");

      expect(document.getElementById("profileForm").style.display).toBe("none");
      expect(document.getElementById("editBtn").style.display).toBe("inline-block");
      expect(document.getElementById("emailInput").disabled).toBe(true);
      expect(document.getElementById("toggleEmailEdit").checked).toBe(false);
    });

    test("shows edit form when Edit button is clicked", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      });

      await initializeProfileScreen();

      document.getElementById("editBtn").click();

      expect(document.getElementById("profileForm").style.display).toBe("block");
      expect(document.getElementById("editBtn").style.display).toBe("none");
    });

    test("cancel restores view mode and resets input values", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      });

      await initializeProfileScreen();

      document.getElementById("editBtn").click();
      document.getElementById("nameInput").value = "Changed Name";

      document.getElementById("cancelProfileBtn").click();
      await flushPromises();

      expect(document.getElementById("profileForm").style.display).toBe("none");
      expect(document.getElementById("editBtn").style.display).toBe("inline-block");
      expect(document.getElementById("nameInput").value).toBe("Ada Lovelace");
    });

    test("enables and disables email input when checkbox is toggled", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      });

      await initializeProfileScreen();

      const toggle = document.getElementById("toggleEmailEdit");
      const emailInput = document.getElementById("emailInput");

      expect(emailInput.disabled).toBe(true);

      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      expect(emailInput.disabled).toBe(false);

      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));

      expect(emailInput.disabled).toBe(true);
    });

    test("switches to password tab when password tab button is clicked", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {},
        },
      });

      await initializeProfileScreen();

      document.getElementById("tabBtnPassword").click();

      expect(document.getElementById("tab-profile").style.display).toBe("none");
      expect(document.getElementById("tab-password").style.display).toBe("block");
      expect(document.getElementById("tab-preferences").style.display).toBe("none");
      expect(document.getElementById("tabBtnPassword").classList.contains("active")).toBe(true);
    });

    test("switches to preferences tab when preferences tab button is clicked", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {},
        },
      });

      await initializeProfileScreen();

      document.getElementById("tabBtnPrefs").click();

      expect(document.getElementById("tab-profile").style.display).toBe("none");
      expect(document.getElementById("tab-password").style.display).toBe("none");
      expect(document.getElementById("tab-preferences").style.display).toBe("block");
      expect(document.getElementById("tabBtnPrefs").classList.contains("active")).toBe(true);
    });

    test("shows validation error when saving with an empty name", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      });

      await initializeProfileScreen();

      document.getElementById("editBtn").click();
      document.getElementById("nameInput").value = "";

      document.getElementById("profileForm").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      await flushPromises();

      expect(document.getElementById("nameError").style.display).toBe("block");
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    test("shows validation error when email edit is enabled with invalid email", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      });

      await initializeProfileScreen();

      document.getElementById("editBtn").click();
      document.getElementById("toggleEmailEdit").checked = true;
      document.getElementById("toggleEmailEdit").dispatchEvent(new Event("change"));
      document.getElementById("emailInput").value = "not-an-email";

      document.getElementById("profileForm").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      await flushPromises();

      expect(document.getElementById("emailError").style.display).toBe("block");
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    test("submits profile update and shows success message", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      });

      updateUserMock.mockResolvedValue({ error: null });

      await initializeProfileScreen();

      document.getElementById("editBtn").click();
      document.getElementById("nameInput").value = "Ada Byron";

      document.getElementById("profileForm").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      await flushPromises(4);

      expect(updateUserMock).toHaveBeenCalledWith({
        data: {
          name: "Ada Byron",
          full_name: "Ada Byron",
        },
      });

      expect(document.getElementById("statusPanel").style.display).toBe("block");
      expect(document.getElementById("statusMsg").textContent).toBe("Profile updated successfully.");
      expect(document.getElementById("profileForm").style.display).toBe("none");
    });

    test("saves preferences to localStorage and restores them on next initialization", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {},
        },
      });

      await initializeProfileScreen();

      const checkbox = document.getElementById("prefEmailUpdates");
      checkbox.checked = true;

      document.getElementById("prefsForm").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      expect(localStorage.getItem("prefEmailUpdates")).toBe("true");
      expect(document.getElementById("statusMsg").textContent).toBe("Preferences saved.");

      buildProfileDom();
      await initializeProfileScreen();

      expect(document.getElementById("prefEmailUpdates").checked).toBe(true);
    });

    test("updates password successfully", async () => {
      getCurrentSessionMock.mockResolvedValue({
        user: {
          email: "reader@example.com",
          created_at: "2025-05-10T12:00:00.000Z",
          user_metadata: {},
        },
      });

      updateUserMock.mockResolvedValue({ error: null });

      await initializeProfileScreen();

      document.getElementById("tabBtnPassword").click();
      document.getElementById("newPasswordInput").value = "newpass123";

      document.getElementById("passwordForm").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      await flushPromises(3);

      expect(updateUserMock).toHaveBeenCalledWith({ password: "newpass123" });
      expect(document.getElementById("statusMsg").textContent).toBe("Password updated successfully.");
      expect(document.getElementById("newPasswordInput").value).toBe("");
    });
  });
});