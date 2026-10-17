"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authClient } from "../../../lib/auth-client";
import { CreateIssueForm } from "../../components/CreateIssueForm";
import { WorkspaceLoading } from "../../components/WorkspaceLoading";

export default function NewIssuePage() {
  return (
    <Suspense fallback={<WorkspaceLoading label="new issue" />}>
      <NewIssueForm />
    </Suspense>
  );
}

function NewIssueForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: activeMember } = authClient.useActiveMember();

  useEffect(() => {
    if (activeMember?.role === "viewer") {
      router.replace("/issues");
    }
  }, [activeMember?.role, router]);

  return (
    <div className="page create-issue-page">
      <Link className="back-link" href="/issues">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to issues
      </Link>
      <section className="create-issue-modal create-issue-card">
        <header className="create-issue-header">
          <h1>Create issue</h1>
        </header>
        <CreateIssueForm
          defaultProjectId={searchParams.get("project")}
          defaults={{ parentId: searchParams.get("parent") }}
          onCreated={(issue) => router.push(`/issues/${issue.id}`)}
          onCancel={() => router.push("/issues")}
        />
      </section>
    </div>
  );
}
