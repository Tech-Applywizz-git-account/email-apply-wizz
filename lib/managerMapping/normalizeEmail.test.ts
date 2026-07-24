import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./normalizeEmail";

describe("normalizeEmail", () => {
  it("lowercases a mixed-case email", () => {
    expect(normalizeEmail("Ramakrishnaa.Tejavath@ApplyWizz.AI")).toBe("ramakrishnaa.tejavath@applywizz.ai");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("is idempotent on already-normalized input", () => {
    expect(normalizeEmail("foo@bar.com")).toBe("foo@bar.com");
  });

  it("does not alter the domain beyond lowercasing", () => {
    expect(normalizeEmail("someone@ApplyWizz.COM")).toBe("someone@applywizz.com");
    expect(normalizeEmail("someone@applywizz.ai")).toBe("someone@applywizz.ai");
  });
});
