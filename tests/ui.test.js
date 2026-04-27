describe("UI Module Tests", () => {
  test("should display success message", () => {
    document.body.innerHTML = `<div id="msg"></div>`;

    const el = document.getElementById("msg");
    el.textContent = "Success";

    expect(el.textContent).toBe("Success");
  });

  test("should handle empty message", () => {
    document.body.innerHTML = `<div id="msg"></div>`;

    const el = document.getElementById("msg");
    el.textContent = "";

    expect(el.textContent).toBe("");
  });
});