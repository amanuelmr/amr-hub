"use client";

import { useParams } from "next/navigation";
import { TimelineView } from "../../../components/timeline/TimelineView";

export default function TimelinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <TimelineView projectIds={[projectId]} mode="project" />;
}
