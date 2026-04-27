import { TextEncoder, TextDecoder } from "node:util";

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

const { JSDOM } = await import("jsdom");

describe("DOM tests", () => {
  test("jsdom loads correctly", () => {
    const dom = new JSDOM(`<!DOCTYPE html><p>Hello</p>`);
    const paragraph = dom.window.document.querySelector("p");

    expect(paragraph.textContent).toBe("Hello");
  });
});