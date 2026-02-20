import { describe, it, expect } from "vitest";
import { sanitizeHTML } from "../js/modules/navigation.js";

describe("sanitizeHTML", () => {
  it("returns empty string for non-string input", () => {
    expect(sanitizeHTML(null)).toBe("");
    expect(sanitizeHTML(undefined)).toBe("");
    expect(sanitizeHTML(123)).toBe("");
  });

  it("removes script tags", () => {
    const input = `<div>Hello</div><script>alert("xss")</script>`;
    const output = sanitizeHTML(input);
    expect(output).toContain("Hello");
    expect(output).not.toContain("<script");
    expect(output).not.toContain("alert");
  });

  it("removes inline event handlers like onclick", () => {
    const input = `<button onclick="alert('xss')">Click</button>`;
    const output = sanitizeHTML(input);
    expect(output).toContain("<button");
    expect(output).toContain("Click");
    expect(output).not.toContain("onclick");
  });

  it("removes javascript: URLs in href", () => {
    const input = `<a href="javascript:alert(1)">bad</a>`;
    const output = sanitizeHTML(input);
    expect(output).toContain(">bad</a>");
    expect(output).not.toContain("javascript:");
  });
});
