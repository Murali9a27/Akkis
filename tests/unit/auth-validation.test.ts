import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, newPasswordSchema, signInSchema } from "@/lib/validations/auth";

describe("auth validation", () => {
  it("normalises email", () => {
    expect(signInSchema.parse({ email: "  Owner@Example.COM ", password: "x" }).email).toBe(
      "owner@example.com",
    );
  });
  it("rejects malformed email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
  it("enforces the password policy (12+ chars, letter and digit, matching)", () => {
    const ok = { password: "bakingtime2026", confirmPassword: "bakingtime2026" };
    expect(newPasswordSchema.safeParse(ok).success).toBe(true);
    expect(
      newPasswordSchema.safeParse({ password: "short1", confirmPassword: "short1" }).success,
    ).toBe(false);
    expect(
      newPasswordSchema.safeParse({
        password: "onlyletterslong",
        confirmPassword: "onlyletterslong",
      }).success,
    ).toBe(false);
    expect(
      newPasswordSchema.safeParse({ password: "123456789012", confirmPassword: "123456789012" })
        .success,
    ).toBe(false);
    expect(newPasswordSchema.safeParse({ ...ok, confirmPassword: "different2026" }).success).toBe(
      false,
    );
    expect(
      newPasswordSchema.safeParse({
        password: `a1${"é".repeat(40)}`,
        confirmPassword: `a1${"é".repeat(40)}`,
      }).success,
    ).toBe(false);
  });
});
