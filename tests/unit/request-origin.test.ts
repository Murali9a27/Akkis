import { describe, expect, it } from "vitest";
import { resolveRequestOrigin, type OriginHeaders } from "@/lib/auth/request-origin";

const FALLBACK = "https://www.akkishealthybaking.com";
const none: OriginHeaders = { origin: null, host: null, forwardedHost: null, forwardedProto: null };

describe("resolveRequestOrigin", () => {
  it("uses the Origin header, reduced to scheme + host + port", () => {
    expect(resolveRequestOrigin({ ...none, origin: "http://127.0.0.1:3000" }, FALLBACK)).toBe(
      "http://127.0.0.1:3000",
    );
    expect(
      resolveRequestOrigin(
        { ...none, origin: "https://akkis-git-next-app-team.vercel.app/x?y=1" },
        FALLBACK,
      ),
    ).toBe("https://akkis-git-next-app-team.vercel.app");
  });

  it("falls back to forwarded/Host headers when Origin is absent or opaque", () => {
    expect(
      resolveRequestOrigin(
        { ...none, origin: "null", forwardedHost: "preview.example.app", forwardedProto: "https" },
        FALLBACK,
      ),
    ).toBe("https://preview.example.app");
    expect(resolveRequestOrigin({ ...none, host: "localhost:3000" }, FALLBACK)).toBe(
      "http://localhost:3000",
    );
    expect(resolveRequestOrigin({ ...none, host: "www.akkishealthybaking.com" }, FALLBACK)).toBe(
      "https://www.akkishealthybaking.com",
    );
  });

  it("ignores non-http(s) and malformed values", () => {
    expect(resolveRequestOrigin({ ...none, origin: "javascript:alert(1)" }, FALLBACK)).toBe(
      FALLBACK,
    );
    expect(resolveRequestOrigin({ ...none, host: "evil.example/path" }, FALLBACK)).toBe(FALLBACK);
    expect(resolveRequestOrigin({ ...none, host: "a b" }, FALLBACK)).toBe(FALLBACK);
    expect(
      resolveRequestOrigin({ ...none, host: "example.app", forwardedProto: "ftp" }, FALLBACK),
    ).toBe("https://example.app");
  });

  it("uses the configured site URL when nothing usable is present", () => {
    expect(resolveRequestOrigin(none, FALLBACK)).toBe(FALLBACK);
  });
});
