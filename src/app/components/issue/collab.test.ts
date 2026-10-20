import { describe, expect, it } from "vitest";
import {
  adjacentIssueId,
  issueIdsFromHrefs,
  parseIssueNavigation,
} from "./issueNav";
import {
  isAllowedReaction,
  reactionTooltip,
  summarizeReactions,
} from "../../data/reactions";
import { legacyCommentToHtml } from "../../data/richText";

describe("issue navigation order", () => {
  const ids = ["WEB-3", "WEB-1", "WEB-7"];

  it("moves forward and backward within the list", () => {
    expect(adjacentIssueId(ids, "WEB-1", 1)).toBe("WEB-7");
    expect(adjacentIssueId(ids, "WEB-1", -1)).toBe("WEB-3");
  });

  it("stops at either end and when the issue is not in the list", () => {
    expect(adjacentIssueId(ids, "WEB-7", 1)).toBeNull();
    expect(adjacentIssueId(ids, "WEB-3", -1)).toBeNull();
    expect(adjacentIssueId(ids, "WEB-99", 1)).toBeNull();
  });

  it("reads issue keys from selectedIssue links in order, once each", () => {
    expect(
      issueIdsFromHrefs([
        "/projects/p/board?selectedIssue=WEB-2",
        "/projects/p/board?view=x&selectedIssue=WEB-5#top",
        "/projects/p/board?selectedIssue=WEB-2",
        "/issues/WEB-9",
      ]),
    ).toEqual(["WEB-2", "WEB-5"]);
  });

  it("parses the stored contract and rejects garbage", () => {
    expect(
      parseIssueNavigation('{"ids":["A-1",2,"A-2"],"source":"/x","savedAt":5}'),
    ).toEqual({ ids: ["A-1", "A-2"], source: "/x", savedAt: 5 });
    expect(parseIssueNavigation("not json")).toBeNull();
    expect(parseIssueNavigation('{"ids":"A-1"}')).toBeNull();
    expect(parseIssueNavigation(null)).toBeNull();
  });
});

describe("comment reactions", () => {
  it("only allows the offered emoji", () => {
    expect(isAllowedReaction("👍")).toBe(true);
    expect(isAllowedReaction("🚀")).toBe(true);
    expect(isAllowedReaction("<b>")).toBe(false);
    expect(isAllowedReaction(3)).toBe(false);
  });

  it("groups rows by emoji in first-use order with counts and names", () => {
    const summary = summarizeReactions([
      { emoji: "🎉", userId: "u2", createdAt: "2026-01-02", user: { name: "Ben" } },
      { emoji: "👍", userId: "u1", createdAt: "2026-01-01", user: { name: "Ana" } },
      { emoji: "👍", userId: "u2", createdAt: "2026-01-03", user: { name: "Ben" } },
    ]);
    expect(summary).toEqual([
      { emoji: "👍", count: 2, userIds: ["u1", "u2"], names: ["Ana", "Ben"] },
      { emoji: "🎉", count: 1, userIds: ["u2"], names: ["Ben"] },
    ]);
  });

  it("writes Jira-style tooltips", () => {
    expect(
      reactionTooltip(
        { emoji: "👍", userIds: ["u1", "u2"], names: ["Ana", "Ben"] },
        "u2",
      ),
    ).toBe("Ana and You reacted with 👍");
    expect(
      reactionTooltip(
        {
          emoji: "🎉",
          userIds: ["a", "b", "c", "d", "e"],
          names: ["A", "B", "C", "D", "E"],
        },
        null,
      ),
    ).toBe("A, B and 3 others reacted with 🎉");
  });
});

describe("legacyCommentToHtml", () => {
  it("converts plain comments with mentions to editor HTML, escaped", () => {
    expect(legacyCommentToHtml("Hi @[Jo <x>](m1)\nline\n\n<b>next</b>")).toBe(
      '<p>Hi <span data-type="mention" data-id="m1" data-label="Jo &lt;x&gt;">@Jo &lt;x&gt;</span><br>line</p><p>&lt;b&gt;next&lt;/b&gt;</p>',
    );
  });

  it("leaves rich HTML untouched", () => {
    expect(legacyCommentToHtml("<p>Hi</p>")).toBe("<p>Hi</p>");
  });
});
