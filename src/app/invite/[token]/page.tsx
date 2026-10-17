"use client";

import { FormEvent, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { authClient } from "../../../lib/auth-client";
import {
  AuthAlert,
  AuthHeading,
  AuthLoading,
  AuthPage,
} from "../../components/auth/AuthCard";
import {
  AuthField,
  EmailChip,
  PasswordChecklist,
  PasswordField,
  SubmitButton,
} from "../../components/auth/AuthFields";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
} from "../../components/auth/passwordRules";

type InvitationDetails = {
  email: string;
  invitedBy: string;
  organizationName: string;
  role: "member" | "viewer";
  expiresAt: string;
};

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Invitation unavailable");
        return response.json() as Promise<InvitationDetails>;
      })
      .then(setInvitation)
      .catch(() => setInvitation(null))
      .finally(() => setIsChecking(false));
  }, [token]);

  const signOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    router.refresh();
    setIsSigningOut(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isPasswordAcceptable(password)) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        name: name.trim(),
        password,
      }),
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(result?.error ?? "Your account could not be created.");
      setIsSubmitting(false);
      return;
    }

    const signIn = await authClient.signIn.email({
      email: invitation?.email ?? "",
      password,
      rememberMe: true,
    });

    if (signIn.error) {
      router.replace("/login");
      return;
    }

    router.replace("/account");
    router.refresh();
  };

  if (isChecking || isSessionPending) {
    return <AuthLoading label="Checking invitation" />;
  }

  const loginFooter = <Link href="/login">Already have an account? Log in</Link>;

  if (!invitation) {
    return (
      <AuthPage footer={loginFooter}>
        <AuthHeading
          icon={<ShieldAlert size={22} aria-hidden="true" />}
          title="This invitation can't be used"
          subtitle="It may have expired, been revoked, or already been accepted. Ask a workspace admin to send you a new invitation."
        />
        <Link className="primary-button acct-button" href="/login">
          Go to log in
        </Link>
      </AuthPage>
    );
  }

  const roleLabel = invitation.role === "viewer" ? "viewer" : "member";
  const expiresAt = new Date(invitation.expiresAt);
  const expiresLabel = Number.isNaN(expiresAt.getTime())
    ? null
    : expiresAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  const inviteSummary = (
    <div className="acct-invite">
      <div className="acct-invite-avatars" aria-hidden="true">
        <span className="acct-avatar">{initials(invitation.invitedBy)}</span>
        <span className="acct-avatar acct-avatar-org">
          {initials(invitation.organizationName)}
        </span>
      </div>
      <dl className="acct-invite-meta">
        <div>
          <dt>Workspace</dt>
          <dd>{invitation.organizationName}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{roleLabel}</dd>
        </div>
        {expiresLabel && (
          <div>
            <dt>Expires</dt>
            <dd>{expiresLabel}</dd>
          </div>
        )}
      </dl>
    </div>
  );

  if (session) {
    return (
      <AuthPage>
        <AuthHeading
          title="Switch accounts to accept"
          subtitle={
            <>
              This invitation is for <strong>{invitation.email}</strong>, but
              you&apos;re logged in as <strong>{session.user.email}</strong>.
            </>
          }
        />
        {inviteSummary}
        <SubmitButton
          type="button"
          onClick={() => void signOut()}
          busy={isSigningOut}
          busyLabel="Logging out"
          icon={<LogOut size={15} aria-hidden="true" />}
        >
          Log out to accept
        </SubmitButton>
      </AuthPage>
    );
  }

  const title = (
    <>
      {invitation.invitedBy} invited you to join {invitation.organizationName}{" "}
      on AMR Hub
    </>
  );

  if (!isAccepting) {
    return (
      <AuthPage footer={loginFooter}>
        <AuthHeading
          title={title}
          subtitle={`Join as a workspace ${roleLabel} to collaborate on issues, boards and projects.`}
        />
        {inviteSummary}
        <EmailChip email={invitation.email} />
        <SubmitButton type="button" onClick={() => setIsAccepting(true)}>
          Accept invitation
        </SubmitButton>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      footer={loginFooter}
      legal="By signing up, I accept the AMR Hub terms of service and acknowledge the privacy policy."
    >
      <AuthHeading
        eyebrow={`Joining ${invitation.organizationName}`}
        title="Sign up to continue"
        subtitle="Create your account to accept the invitation."
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <form className="acct-form" onSubmit={handleSubmit}>
        <EmailChip email={invitation.email} />
        <AuthField
          label="Full name"
          type="text"
          value={name}
          onValueChange={setName}
          autoComplete="name"
          placeholder="Enter full name"
          minLength={2}
          maxLength={80}
          required
          autoFocus
        />
        <PasswordField
          value={password}
          onValueChange={setPassword}
          autoComplete="new-password"
          placeholder="Create password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
        <PasswordChecklist password={password} />
        <SubmitButton
          busy={isSubmitting}
          busyLabel="Joining workspace"
          disabled={name.trim().length < 2 || !isPasswordAcceptable(password)}
        >
          Join {invitation.organizationName}
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
