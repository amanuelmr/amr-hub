/** Comment reactions shared by the client (emoji bar, picker) and server. */

/** The quick-reaction bar Jira shows under every comment. */
export const QUICK_REACTIONS = ["👍", "👎", "😄", "🎉", "❤️", "👀"] as const;

/** The "more reactions" picker; also the editor's emoji button. */
export const PICKER_EMOJI = [
  "😀",
  "😂",
  "😊",
  "😍",
  "🤔",
  "😮",
  "😢",
  "😡",
  "🙏",
  "👏",
  "🙌",
  "💪",
  "👌",
  "✅",
  "❌",
  "⚠️",
  "🔥",
  "🚀",
  "💯",
  "⭐",
  "💡",
  "🐛",
  "🤝",
  "👋",
] as const;

export const ALLOWED_REACTIONS: readonly string[] = [
  ...QUICK_REACTIONS,
  ...PICKER_EMOJI,
];

export function isAllowedReaction(emoji: unknown): emoji is string {
  return typeof emoji === "string" && ALLOWED_REACTIONS.includes(emoji);
}

export type CommentReactionSummary = {
  emoji: string;
  count: number;
  userIds: string[];
  /** Display names in reaction order, for the "who reacted" tooltip. */
  names: string[];
};

/**
 * Groups stored reaction rows by emoji, keeping the order each emoji was
 * first used (so the bar does not reshuffle as counts change).
 */
export function summarizeReactions(
  rows: {
    emoji: string;
    userId: string;
    createdAt?: Date | string;
    user?: { name: string } | null;
  }[],
): CommentReactionSummary[] {
  const ordered = [...rows].sort((left, right) => {
    const a = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const b = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return a - b;
  });
  const groups = new Map<string, CommentReactionSummary>();
  for (const row of ordered) {
    let group = groups.get(row.emoji);
    if (!group) {
      group = { emoji: row.emoji, count: 0, userIds: [], names: [] };
      groups.set(row.emoji, group);
    }
    if (group.userIds.includes(row.userId)) continue;
    group.count += 1;
    group.userIds.push(row.userId);
    group.names.push(row.user?.name ?? "Someone");
  }
  return [...groups.values()];
}

/** Tooltip copy in Jira's style: "Ana, Ben and 2 others reacted with 👍". */
export function reactionTooltip(
  reaction: Pick<CommentReactionSummary, "emoji" | "names" | "userIds">,
  currentUserId: string | null,
) {
  const names = reaction.names.map((name, index) =>
    reaction.userIds[index] === currentUserId ? "You" : name,
  );
  let who: string;
  if (names.length <= 1) who = names[0] ?? "Nobody";
  else if (names.length <= 3) {
    who = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  } else {
    const rest = names.length - 2;
    who = `${names.slice(0, 2).join(", ")} and ${rest} others`;
  }
  return `${who} reacted with ${reaction.emoji}`;
}
