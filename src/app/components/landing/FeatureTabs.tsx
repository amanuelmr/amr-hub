"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState, type ReactNode } from "react";
import {
  AppWindow,
  BacklogMock,
  BoardMock,
  CalendarMock,
  ListMock,
  ReportsMock,
  TimelineMock,
} from "./mocks";

type Showcase = {
  value: string;
  label: string;
  tab: string;
  title: string;
  body: string;
  points: string[];
  mock: ReactNode;
};

const SHOWCASES: Showcase[] = [
  {
    value: "board",
    label: "Board",
    tab: "Board",
    title: "See every work item move across your workflow",
    body: "Drag cards between columns that map to your workflow statuses. Group by swimlane, filter by assignee or label, and set WIP limits on Kanban boards.",
    points: ["Columns follow your custom workflow", "Quick filters and swimlanes", "WIP limits for Kanban"],
    mock: <BoardMock />,
  },
  {
    value: "backlog",
    label: "Backlog & sprints",
    tab: "Backlog",
    title: "Plan the backlog, then run focused sprints",
    body: "Rank work in the backlog, estimate with story points, and drag items into a sprint. Start sprints with dates and a goal, and when you complete one, decide where unfinished work goes.",
    points: ["Drag-and-drop ranking", "Story point totals per sprint", "Start and complete sprints"],
    mock: <BacklogMock />,
  },
  {
    value: "timeline",
    label: "Timeline",
    tab: "Timeline",
    title: "Map epics against time",
    body: "Lay epics and their child work out on a timeline to see what lands when, and drag bars to adjust start and due dates as plans change.",
    points: ["Epics with child work items", "Start and due dates", "Month view at a glance"],
    mock: <TimelineMock />,
  },
  {
    value: "list",
    label: "List",
    tab: "List",
    title: "Search and edit work in a dense table",
    body: "Query with JQL, sort and choose columns, save the query as a filter, and bulk change the results in a single step.",
    points: ["JQL search", "Saved filters", "Bulk change"],
    mock: <ListMock />,
  },
  {
    value: "reports",
    label: "Reports",
    tab: "Reports",
    title: "Know how delivery is really going",
    body: "Built-in agile reports cover burndown, burnup, velocity, sprint report, cumulative flow, control chart, created vs resolved, time tracking, workload, versions and epics.",
    points: ["Sprint burndown and velocity", "Cumulative flow and control chart", "Workload and time tracking"],
    mock: <ReportsMock />,
  },
  {
    value: "calendar",
    label: "Calendar",
    tab: "Calendar",
    title: "Put due dates on a calendar",
    body: "See work items on the day they are due, spot crunch weeks early, and drag an item to another day to reschedule it.",
    points: ["Month view of due dates", "Drag to reschedule", "Unscheduled work listed alongside"],
    mock: <CalendarMock />,
  },
];

const AUTO_ADVANCE_MS = 8000;

export function FeatureTabs() {
  const [value, setValue] = useState(SHOWCASES[0].value);
  const [paused, setPaused] = useState(false);
  const [userChose, setUserChose] = useState(false);

  useEffect(() => {
    if (paused || userChose) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      const index = SHOWCASES.findIndex((item) => item.value === value);
      setValue(SHOWCASES[(index + 1) % SHOWCASES.length].value);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [value, paused, userChose]);

  return (
    <Tabs.Root
      className="lp-tabs"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        setUserChose(true);
      }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Tabs.List className="lp-tab-list" aria-label="Product views">
        {SHOWCASES.map((item) => (
          <Tabs.Trigger key={item.value} value={item.value} className="lp-tab">
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {SHOWCASES.map((item) => (
        <Tabs.Content key={item.value} value={item.value} className="lp-tab-panel">
          <div className="lp-tab-copy">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <ul className="lp-checks">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <AppWindow label={`Illustration of the ${item.label} view`} active={item.tab}>
            {item.mock}
          </AppWindow>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
