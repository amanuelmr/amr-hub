"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import {
  AuthAlert,
  AuthFooterLinks,
  AuthHeading,
  AuthPage,
} from "../components/auth/AuthCard";
import {
  AuthField,
  EmailChip,
  SubmitButton,
} from "../components/auth/AuthFields";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const requestReset = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "We couldn't send the recovery link. Try again shortly.",
      );
      return;
    }

    setIsSent(true);
  };

  const footer = (
    <AuthFooterLinks>
      {[
        <Link href="/login" key="login">
          Return to log in
        </Link>,
        <Link href="/forgot-password/recovery-code" key="code">
          Use a recovery code
        </Link>,
      ]}
    </AuthFooterLinks>
  );

  if (isSent) {
    return (
      <AuthPage footer={footer}>
        <AuthHeading
          icon={<MailCheck size={22} aria-hidden="true" />}
          title="Check your inbox to log in"
          subtitle="If an account exists, we sent a recovery link to:"
        />
        <EmailChip email={email.trim()} />
        <p className="acct-body">
          The link expires in 1 hour and works once. Resetting your password
          logs you out of every other session.
        </p>
        {error && <AuthAlert>{error}</AuthAlert>}
        <div className="acct-stack">
          <SubmitButton
            type="button"
            variant="secondary"
            onClick={() => void requestReset()}
            busy={isSubmitting}
            busyLabel="Sending"
          >
            Resend recovery link
          </SubmitButton>
          <Link className="primary-button acct-button" href="/login">
            Back to log in
          </Link>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage footer={footer}>
      <AuthHeading
        title="Can't log in?"
        subtitle="We'll send a recovery link to"
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <form className="acct-form" onSubmit={requestReset}>
        <AuthField
          label="Email"
          type="email"
          value={email}
          onValueChange={setEmail}
          autoComplete="email"
          inputMode="email"
          placeholder="Enter your email"
          required
          autoFocus
        />
        <SubmitButton
          busy={isSubmitting}
          busyLabel="Sending link"
          disabled={!email.trim()}
        >
          Send recovery link
        </SubmitButton>
      </form>

      <p className="acct-body acct-muted">
        Lost access to your email?{" "}
        <Link className="acct-inline-link" href="/forgot-password/recovery-code">
          Reset with a recovery code
        </Link>
      </p>
    </AuthPage>
  );
}
