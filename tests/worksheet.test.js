describe("Worksheet Download", () => {
  test("worksheet name exists", () => {
    const worksheet = "Peg The Hen";
    expect(worksheet).toBeDefined();
  });

  test("file should be pdf", () => {
    const file = "peg_the_hen.pdf";
    expect(file.endsWith(".pdf")).toBe(true);
  });
});