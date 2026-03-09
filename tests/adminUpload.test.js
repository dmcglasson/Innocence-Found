describe("Admin Upload", () => {
  test("valid file upload", () => {
    const file = "chapter1.pdf";
    expect(file.endsWith(".pdf")).toBe(true);
  });

  test("reject invalid file", () => {
    const file = "chapter1.exe";
    expect(file.endsWith(".pdf")).toBe(false);
  });
});