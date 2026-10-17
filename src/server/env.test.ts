import { describe, expect, it } from "vitest";
import { loadServerEnvironment } from "./env";

/** Next types NODE_ENV as required on ProcessEnv; these fixtures omit it on purpose. */
function asEnvironment(values: Record<string, string | undefined>) {
  return values as NodeJS.ProcessEnv;
}

const validEnvironment = {
  DATABASE_URL:
    "postgresql://app:secret@pool.example.com:5432/amr_hub?sslmode=require",
  DIRECT_URL:
    "postgresql://app:secret@db.example.com:5432/amr_hub?sslmode=require",
  NEXT_PUBLIC_APP_URL: "https://amr-hub.example.com",
  BETTER_AUTH_SECRET: "a".repeat(32),
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "AMR Hub <no-reply@amr-hub.example.com>",
};

describe("loadServerEnvironment", () => {
  it("accepts database and authentication configuration", () => {
    expect(loadServerEnvironment(asEnvironment(validEnvironment))).toEqual(
      validEnvironment,
    );
  });

  it.each([
    ["a SQLite runtime URL", { DATABASE_URL: "file:./dev.db" }],
    ["a missing direct URL", { DIRECT_URL: undefined }],
    ["an invalid public origin", { NEXT_PUBLIC_APP_URL: "amr-hub" }],
    ["a short authentication secret", { BETTER_AUTH_SECRET: "short" }],
    ["a missing Resend API key", { RESEND_API_KEY: undefined }],
    ["a missing email sender", { EMAIL_FROM: undefined }],
  ])("rejects %s", (_, change) => {
    expect(() =>
      loadServerEnvironment(asEnvironment({ ...validEnvironment, ...change })),
    ).toThrow("Invalid server environment");
  });

  it("rejects a production environment missing the public app URL", () => {
    expect(() =>
      loadServerEnvironment(
        asEnvironment({
          ...validEnvironment,
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: undefined,
        }),
      ),
    ).toThrow("NEXT_PUBLIC_APP_URL is required in production");
  });

  it("allows a non-production environment to fall back on the public app URL", () => {
    expect(() =>
      loadServerEnvironment(
        asEnvironment({
          ...validEnvironment,
          NODE_ENV: "development",
          NEXT_PUBLIC_APP_URL: undefined,
        }),
      ),
    ).not.toThrow();
  });

  it("uses the branch URL on a Vercel preview without a configured app URL", () => {
    expect(
      loadServerEnvironment(
        asEnvironment({
          ...validEnvironment,
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: undefined,
          VERCEL_ENV: "preview",
          VERCEL_BRANCH_URL: "amr-hub-git-jira-parity.vercel.app",
          VERCEL_URL: "amr-hub-abc123.vercel.app",
        }),
      ).NEXT_PUBLIC_APP_URL,
    ).toBe("https://amr-hub-git-jira-parity.vercel.app");
  });

  it("keeps requiring the app URL on Vercel production", () => {
    expect(() =>
      loadServerEnvironment(
        asEnvironment({
          ...validEnvironment,
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: undefined,
          VERCEL_ENV: "production",
          VERCEL_URL: "amr-hub-abc123.vercel.app",
        }),
      ),
    ).toThrow("NEXT_PUBLIC_APP_URL is required in production");
  });
});
