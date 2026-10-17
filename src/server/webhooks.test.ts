import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const { isPrivateAddress, parseWebhookEvents, signWebhookBody, webhookUrlProblem } =
  await import("./webhooks");

describe("isPrivateAddress", () => {
  it.each([
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "172.15.255.255", "1.1.1.1", "2606:4700::1111"])(
    "allows %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("webhookUrlProblem", () => {
  it("requires https outside development", () => {
    expect(webhookUrlProblem("https://example.com/hook", false)).toBeNull();
    expect(webhookUrlProblem("http://example.com/hook", false)).toMatch(/https/);
    expect(webhookUrlProblem("http://localhost:4000/hook", false)).toMatch(/https/);
    expect(webhookUrlProblem("not a url", false)).toMatch(/valid URL/);
    expect(webhookUrlProblem("https://user:pw@example.com", false)).toMatch(/credentials/);
  });

  it("allows http://localhost in development", () => {
    expect(webhookUrlProblem("http://localhost:4000/hook", true)).toBeNull();
    expect(webhookUrlProblem("http://127.0.0.1:4000/hook", true)).toBeNull();
    expect(webhookUrlProblem("http://example.com/hook", true)).toMatch(/localhost/);
  });
});

describe("signatures and events", () => {
  it("signs with HMAC-SHA256", () => {
    const expected = createHmac("sha256", "secret").update("{}").digest("hex");
    expect(signWebhookBody("{}", "secret")).toBe(`sha256=${expected}`);
  });

  it("parses stored events defensively", () => {
    expect(parseWebhookEvents('["issue_created","bogus"]')).toEqual(["issue_created"]);
    expect(parseWebhookEvents("nope")).toEqual([]);
  });
});
