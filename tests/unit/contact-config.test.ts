import { describe, expect, it } from "vitest";
import { formatPhoneForDisplay, resolveContactConfig, whatsappLink } from "@/lib/config/contact";

// Placeholder values only — real numbers live in .env.local / Vercel, never in code.
const valid = {
  NEXT_PUBLIC_CONTACT_PHONE: "+919876543210",
  NEXT_PUBLIC_WHATSAPP_NUMBER: "+919876543211",
  NEXT_PUBLIC_CONTACT_EMAIL: "Hello@Example.com",
};

describe("contact config", () => {
  it("parses and normalises valid values", () => {
    expect(resolveContactConfig(valid)).toEqual({
      phone: "+919876543210",
      phoneDisplay: "+91 98765 43210",
      whatsapp: "+919876543211",
      email: "hello@example.com",
    });
  });

  it("fails loudly when a value is missing or malformed", () => {
    expect(() => resolveContactConfig({ ...valid, NEXT_PUBLIC_CONTACT_PHONE: undefined })).toThrow(
      /NEXT_PUBLIC_CONTACT_PHONE/,
    );
    expect(() =>
      resolveContactConfig({ ...valid, NEXT_PUBLIC_WHATSAPP_NUMBER: "98765 43210" }),
    ).toThrow(/international format/);
    expect(() => resolveContactConfig({ ...valid, NEXT_PUBLIC_CONTACT_EMAIL: "nope" })).toThrow(
      /NEXT_PUBLIC_CONTACT_EMAIL/,
    );
  });

  it("formats Indian numbers for display", () => {
    expect(formatPhoneForDisplay("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhoneForDisplay("+14155550100")).toBe("+14155550100");
  });

  it("builds wa.me links with a safely encoded message", () => {
    expect(whatsappLink("+919876543211")).toBe("https://wa.me/919876543211");
    expect(whatsappLink("+919876543211", "Tom & Jerry cake #2\n100% eggless")).toBe(
      "https://wa.me/919876543211?text=Tom%20%26%20Jerry%20cake%20%232%0A100%25%20eggless",
    );
  });
});
