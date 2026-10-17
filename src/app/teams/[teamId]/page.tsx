"use client";

import { use } from "react";
import { TeamView } from "../../components/people/TeamView";

export default function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  return <TeamView teamId={teamId} />;
}
