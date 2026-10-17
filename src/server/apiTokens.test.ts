import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const { bearerToken, expiryDate, generateApiToken, hashApiToken, looksLikeApiToken } =
  await import("./apiTokens");

describe("API token helpers", () => {
  it("generates prefixed 32-byte base64url tokens", () => {
    const token = generateApiToken();
    expect(token).toMatch(/^amr_[A-Za-z0-9_-]{43}$/);
    expect(looksLikeApiToken(token)).toBe(true);
    expect(generateApiToken()).not.toBe(token);
  });

  it("hashes with sha256 hex", () => {
    expect(hashApiToken("amr_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiToken("amr_x")).toBe(hashApiToken("amr_x"));
  });

  it("parses bearer headers", () => {
    expect(bearerToken("Bearer amr_abc")).toBe("amr_abc");
    expect(bearerToken("bearer   amr_abc ")).toBe("amr_abc");
    expect(bearerToken("Basic xyz")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("computes expiry dates", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(expiryDate("never", now)).toBeNull();
    expect(expiryDate("30", now)?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("rejects malformed tokens", () => {
    expect(looksLikeApiToken("amr_short")).toBe(false);
    expect(looksLikeApiToken("xyz")).toBe(false);
  });
});
