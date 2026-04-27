import { jest } from "@jest/globals";
import {
  getElement,
  getElements,
  waitForElement,
  removeEventListeners
} from "../js/utils/dom.js";

describe("DOM Module Tests", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("getElement returns an existing element", () => {
    document.body.innerHTML = `<div id="testElement">Hello</div>`;

    const element = getElement("testElement");

    expect(element).not.toBeNull();
    expect(element.textContent).toBe("Hello");
  });

  test("getElement returns null and warns when element is missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const element = getElement("missingElement");

    expect(element).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Element with ID "missingElement" not found'
    );

    warnSpy.mockRestore();
  });

  test("getElements returns an object of requested elements", () => {
    document.body.innerHTML = `
      <div id="first"></div>
      <div id="second"></div>
    `;

    const elements = getElements(["first", "second"]);

    expect(elements.first).not.toBeNull();
    expect(elements.second).not.toBeNull();
  });

  test("waitForElement resolves when element already exists by ID", async () => {
    document.body.innerHTML = `<div id="ready"></div>`;

    const element = await waitForElement("#ready", 100);

    expect(element.id).toBe("ready");
  });

  test("waitForElement resolves when element is added later", async () => {
    setTimeout(() => {
      const newElement = document.createElement("div");
      newElement.className = "late-element";
      document.body.appendChild(newElement);
    }, 10);

    const element = await waitForElement(".late-element", 200);

    expect(element.className).toBe("late-element");
  });

  test("waitForElement rejects when element is not found within timeout", async () => {
    await expect(waitForElement("#neverAppears", 20)).rejects.toThrow(
      "Element #neverAppears not found within 20ms"
    );
  });

  test("removeEventListeners returns cloned element", () => {
    const button = document.createElement("button");
    button.textContent = "Click";

    const clone = removeEventListeners(button);

    expect(clone).not.toBe(button);
    expect(clone.textContent).toBe("Click");
  });

  test("removeEventListeners returns null for missing element", () => {
    expect(removeEventListeners(null)).toBeNull();
  });
});