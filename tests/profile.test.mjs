/** @jest-environment jsdom */

import { jest } from "@jest/globals";

const getCurrentSessionMock = jest.fn();

jest.unstable_mockModule("../js/modules/auth.js", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

const { initializeProfileScreen } = await import("../js/modules/profile.js");

function buildProfileDom() {
  document.body.innerHTML = `
    <div id="viewName"></div>
    <div id="viewName2"></div>
    <div id="viewEmail"></div>
    <div id="viewSubscription"></div>
    <div id="viewEnrolled"></div>
    <input id="nameInput" />
    <input id="emailInput" />
  `;
}

describe("initializeProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildProfileDom();
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
});
