import { describe, expect, it } from "vitest";
import { parseJql } from "../data/jql";
import { GUIDES, findGuide } from "./guides";

describe("guides", () => {
  it("only shows example queries that parse", () => {
    const examples = GUIDES.flatMap((guide) =>
      guide.sections.flatMap((section) => section.examples ?? []),
    );
    expect(examples.length).toBe(10);
    for (const example of examples) {
      const parsed = parseJql(example.code);
      expect(parsed.ok ? "ok" : `${example.code}: ${parsed.error.message}`).toBe("ok");
    }
  });

  it("finds guides by slug", () => {
    expect(findGuide("move-your-work")?.title).toContain("three steps");
    expect(findGuide("nope")).toBeNull();
  });
});
