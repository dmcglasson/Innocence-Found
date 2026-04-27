import { JSDOM } from "jsdom";

describe("DOM Module Tests", () => {
  test("should select element by ID", () => {
    const dom = new JSDOM(`<div id="test">Hello</div>`);
    const document = dom.window.document;

    const el = document.getElementById("test");
    expect(el.textContent).toBe("Hello");
  });

  test("should return null if element not found", () => {
    const dom = new JSDOM(`<div></div>`);
    const document = dom.window.document;

    const el = document.getElementById("missing");
    expect(el).toBeNull();
  });
});