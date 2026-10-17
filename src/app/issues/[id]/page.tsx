"use client";

import { useParams } from "next/navigation";
import { IssueDetailContainer } from "../../components/issue/IssueDetailView";

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  return <IssueDetailContainer issueId={id} variant="page" />;
}
