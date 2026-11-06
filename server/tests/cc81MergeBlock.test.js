describe("SOC 2 CC8.1 merge protection test", () => {
  test("Intentional CI failure - do not merge", () => {
    expect(true).toBe(false);
  });
});