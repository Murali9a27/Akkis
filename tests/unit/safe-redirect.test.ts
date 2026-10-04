import { describe, expect, it } from "vitest";
import { safeAdminRedirect } from "@/lib/auth/safe-redirect";

describe("safeAdminRedirect", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/orders?status=pending", "/admin/orders?status=pending"],
    ["/admin/update-password", "/admin/update-password"],
  ])("allows %s", (input, expected) => {
    expect(safeAdminRedirect(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "https://evil.example/admin",
    "//evil.example/admin",
    "/\\evil.example",
    "javascript:alert(1)",
    "/products",
    "/administrator",
    "/admin/../products",
    "/admin\u0000",
    `/admin/${"a".repeat(600)}`,
  ])("rejects %j", (input) => {
    expect(safeAdminRedirect(input)).toBe("/admin");
  });
});
