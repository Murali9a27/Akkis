import { describe, expect, it } from "vitest";
import { deliverableRecipients, resolveEmailConfig } from "@/lib/email/config";

describe("resolveEmailConfig", () => {
  it("defaults to disabled", () => {
    expect(resolveEmailConfig({}).provider).toBe("disabled");
  });
  it("requires a Resend key and sender when Resend is selected", () => {
    expect(() => resolveEmailConfig({ EMAIL_PROVIDER: "resend" })).toThrow();
    expect(() =>
      resolveEmailConfig({
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "not-a-key",
        EMAIL_FROM: "a@b.co",
      }),
    ).toThrow();
    const config = resolveEmailConfig({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_123",
      EMAIL_FROM: "Akki's <orders@akkishealthybaking.com>",
    });
    expect(config.provider).toBe("resend");
  });
  it("rejects invalid allow-list entries", () => {
    expect(() =>
      resolveEmailConfig({ EMAIL_ALLOWED_RECIPIENTS: "owner@example.com, nope" }),
    ).toThrow();
  });
});

describe("deliverableRecipients (staging guard)", () => {
  it("outside production only allowed recipients receive mail", () => {
    const config = resolveEmailConfig({ EMAIL_ALLOWED_RECIPIENTS: "Owner@Example.com" });
    expect(deliverableRecipients(["owner@example.com", "customer@example.com"], config)).toEqual([
      "owner@example.com",
    ]);
  });
  it("outside production an empty allow-list suppresses everything", () => {
    const config = resolveEmailConfig({ VERCEL_ENV: "preview" });
    expect(deliverableRecipients(["customer@example.com"], config)).toEqual([]);
  });
  it("in production all recipients are delivered", () => {
    const config = resolveEmailConfig({ VERCEL_ENV: "production" });
    expect(deliverableRecipients(["customer@example.com"], config)).toEqual([
      "customer@example.com",
    ]);
  });
});
