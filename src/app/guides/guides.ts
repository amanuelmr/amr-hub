/** Public how-to guides linked from the landing page. */
export type GuideSection = {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  /** Example queries or settings, shown as code. */
  examples?: { code: string; note: string }[];
};

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  tone: "orange" | "lime" | "pink";
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: "move-your-work",
    title: "Move your work to AMR Hub in three steps",
    summary:
      "Bring work over from another tracker or a spreadsheet with a CSV export, without retyping anything.",
    tone: "orange",
    sections: [
      {
        heading: "1. Export a CSV",
        paragraphs: [
          "Export the work items you want to move as a CSV file from your current tracker or spreadsheet. Include the summary, work type, status, priority, assignee, reporter, labels, due date and any custom fields you rely on.",
          "Keep one row per work item. Columns named like Custom field (Team) are recognised as custom fields.",
        ],
      },
      {
        heading: "2. Map columns and values",
        steps: [
          "Open Workspace settings and choose Import.",
          "Pick the project the work should land in and upload the file.",
          "Match each column to an AMR Hub field. Columns you don't need can be skipped.",
          "Map values that differ, such as a status called In QA to your In review status, or names to workspace members.",
          "Check the preview. Rows with problems are listed with the reason, so you can fix them before importing.",
        ],
      },
      {
        heading: "3. Import and check the board",
        paragraphs: [
          "Start the import. Every row becomes a work item with its own key, and the import is recorded in the audit log.",
          "Open the project board and backlog to check that work landed in the right columns, then invite the rest of the team.",
        ],
      },
    ],
  },
  {
    slug: "query-cheat-sheet",
    title: "Query cheat sheet: ten searches every team uses",
    summary:
      "Ten ready-made queries for the search page, saved filters, board quick filters and automation.",
    tone: "lime",
    sections: [
      {
        heading: "How queries work",
        paragraphs: [
          "A query combines fields, operators and values, joined with AND and OR. Functions such as currentUser() and openSprints() keep a query correct over time, and ORDER BY sorts the results.",
          "Type a query on the search page in query mode. Autocomplete suggests fields, values and functions as you type, and any query can be saved as a filter and shared.",
        ],
      },
      {
        heading: "Ten useful queries",
        examples: [
          { code: "assignee = currentUser() AND status != Done ORDER BY priority DESC", note: "My open work, most urgent first" },
          { code: "project = WEB AND sprint in openSprints()", note: "Everything in the current sprint" },
          { code: "assignee is EMPTY AND status != Done", note: "Work nobody has picked up" },
          { code: "due < now() AND status != Done", note: "Overdue work" },
          { code: "due >= startOfDay() AND due <= endOfWeek()", note: "Due this week" },
          { code: "type = Bug AND priority in (High, Urgent) AND status != Done", note: "Urgent bugs" },
          { code: "flagged = true", note: "Flagged impediments" },
          { code: "updated >= -7d ORDER BY updated DESC", note: "What changed in the last week" },
          { code: "reporter = currentUser() AND resolved >= startOfWeek()", note: "My requests finished this week" },
          { code: "key in issueHistory() ORDER BY lastViewed DESC", note: "Work I viewed recently" },
        ],
      },
      {
        heading: "Where to use them",
        paragraphs: [
          "Save a query as a filter to reuse it, share it with a project, team, group or person, and subscribe to get its results by email.",
          "The same queries work in board quick filters, dashboard gadgets and automation conditions.",
        ],
      },
    ],
  },
  {
    slug: "automation-starter-rules",
    title: "Five automation rules to set up on day one",
    summary:
      "Small rules that save clicks every day: assignment, stale work reminders, welcome comments and keeping parents in step.",
    tone: "pink",
    sections: [
      {
        heading: "Before you start",
        paragraphs: [
          "Automation lives in each project's settings. Every rule has a trigger, optional conditions and one or more actions, and every run is recorded in the rule's log.",
        ],
      },
      {
        heading: "The five rules",
        steps: [
          "Assign new bugs. Trigger: Issue created. Condition: work type is Bug. Action: Assign issue to your triage lead.",
          "Move the parent when work starts. Trigger: Issue transitioned to In progress. Action: Transition parent issue to In progress.",
          "Flag stale work. Trigger: Scheduled, daily, for work matching a query such as status = \"In progress\" AND updated <= -5d. Actions: Flag issue, then add a comment asking for an update.",
          "Welcome comments on support requests. Trigger: Issue created. Condition: label is support. Action: Comment on issue with a template that uses smart values like {{issue.key}}.",
          "Close parents automatically. Trigger: Issue transitioned to Done. Condition: all subtasks are done. Action: Transition parent issue to Done.",
        ],
      },
      {
        heading: "Keep rules healthy",
        paragraphs: [
          "Start with one rule, check its log after a few runs, then add the next. If a rule should only run on demand, use the Manually triggered trigger and run it from a work item's menu.",
        ],
      },
    ],
  },
];

export function findGuide(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}
