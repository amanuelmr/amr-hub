"use client";

import { use } from "react";
import { PersonProfileView } from "../../components/people/PersonProfileView";

export default function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  return <PersonProfileView userId={userId} />;
}
