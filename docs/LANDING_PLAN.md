# Landing page plan

Goal: make the landing page feel made by people who use the product, not filled in from a template. Keep our colours, fonts and retro console theme. Change the structure, the copy and the demos.

## Why it reads as generated today

- Every section uses the same pattern: small eyebrow, big heading, grey sentence, then a grid.
- Twelve identical feature cards (icon, title, two lines). It reads like a spec sheet, not a story.
- The copy is generic: "Plan, track and ship great work together", "Everything a team needs to run its work". Any tool could say that.
- The "How it works" steps, template grid, FAQ and final call to action are the standard SaaS layout.
- The product mocks are static pictures, so nothing shows how the tool actually feels.
- There are no people, no opinions and no rough edges anywhere.

## What Jira's page does well (and we can borrow without copying)

- A short headline and the sign-up form right in the hero (email field plus one button).
- One large product demo that plays by itself (cards move between columns), with a pause button.
- A proof row straight after the hero.
- A dark band that tells the workflow as four steps (Intake, Plan, Coordinate, Review), each one sentence long.
- Each section shows one large, real-looking screen and one sentence, not a card grid.
- Cards of different sizes and colours in the "More than project management" section, so the rhythm varies.

## The new page, section by section

1. **Hero.**
   - Headline in our own voice, for example "Your sprint, on one screen." with one supporting line.
   - Inline form: work email and a "Start free" button. Log in sits beside it.
   - A live mini board built from the real `BoardCard` component with mock data:
     - Cards move between columns on their own, with a pause button.
     - Visitors can drag a card.
     - Two named pixel cursors ("Maya", "Jon") show people working at the same time.
2. **Honest proof row.** We have no customer logos, so show true facts in mono type instead: "Free, no seat limit", "Scrum and Kanban", "JQL with autocomplete", "REST API and webhooks", "545 tests passing".
3. **"A week in a sprint" band** (dark terminal background). It replaces "How it works".
   - Monday: plan the sprint in the backlog.
   - Wednesday: the board at stand-up.
   - Friday: the sprint report.
   - Release day: release notes.
   - Each day gets one sentence and a small real screen.
4. **Three deep feature rows** instead of twelve cards. They alternate left and right, and each has an interactive demo:
   - JQL: a prompt that types `assignee = currentUser() AND status != Done` and shows autocomplete and results, echoing Jira's "AI era" prompt but in our console style.
   - Timeline: bars you can drag, with dependency arrows.
   - Automation: a rule that builds itself step by step (trigger, condition, action).
5. **"And also" list.** The remaining features as a compact two-column mono list, like a README or changelog, linking to the docs.
6. **Keyboard section.**
   - A small keyboard where keys light up: C to create, / to search, ? for help.
   - It shows our retro personality and a real strength of the product.
7. **By team tabs.** Engineering, Product and Operations, each with a template preview and a two-line story.
8. **A note from the makers.** A short signed paragraph on why we built AMR Hub, with a link to the changelog. This is the strongest human signal.
9. **Short FAQ** with real questions only: Is it really free? Can I import from Jira? Where is my data stored?
10. **Final call to action:** a single line and the email form again.

## Copy rules

- Use concrete nouns, verbs and numbers. Avoid "seamless", "powerful", "everything you need", "great work" and "supercharge".
- Write like a teammate explaining the tool. Short sentences. At most one light joke on the page.
- Every claim must be something the product really does today.

## Visual rules (inside the current theme)

- Vary the rhythm: full-bleed demo, narrow text column, dark band, asymmetric two-column rows. Don't put an eyebrow on every section.
- Add hand-drawn notes (simple SVG scribble arrows and short handwritten-style labels) on two or three screens only.
- Use real product components for the demos, so the landing page never drifts from the app.
- Keep motion subtle and turn it off when the visitor prefers reduced motion. Autoplay always has a pause button.

## Phases

1. Copy and structure: rewrite the text, replace the card grid with the deep rows and the "And also" list, add the makers' note. (Small)
2. Live hero board with autoplay, drag and cursors. (Medium)
3. Interactive demos: JQL prompt, timeline, automation, keyboard. (Medium)
4. "A week in a sprint" band and team tabs. (Small)
5. Accessibility, reduced motion, mobile and performance pass. (Small)
