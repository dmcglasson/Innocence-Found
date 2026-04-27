import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

import { JSDOM } from "jsdom";

describe("DOM Tests", () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1 id="title">Hello World</h1>
          <button id="btn">Click Me</button>
        </body>
      </html>
    `);

    document = dom.window.document;
  });

  test("should find the title element", () => {
    const title = document.getElementById("title");
    expect(title).not.toBeNull();
    expect(title.textContent).toBe("Hello World");
  });

  test("should update text content", () => {
    const title = document.getElementById("title");
    title.textContent = "Updated Text";
    expect(title.textContent).toBe("Updated Text");
  });

  test("should handle button click", () => {
    const button = document.getElementById("btn");

    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });

    button.click();

    expect(clicked).toBe(true);
  });
});