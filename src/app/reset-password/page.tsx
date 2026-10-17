"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, LinkIcon } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import {
  AuthAlert,
  AuthHeading,
  AuthPage,
} from "../components/auth/AuthCard";
import {
  PasswordChecklist,
  PasswordField,
  SubmitButton,
} from "../components/auth/AuthFields";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
} from "../components/auth/passwordRules";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) return;

    if (!isPasswordAcceptable(password)) {
      setError(
        `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`,
      );
      return;
    }
    if (password !== confirmation) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setIsSubmitting(false);

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "This link is invalid or has expired. Request a new one.",
      );
      return;
    }

    setPassword("");
    setConfirmation("");
    setIsComplete(true);
  };

  const footer = <Link href="/login">Return to log in</Link>;

  if (isComplete) {
    return (
      <AuthPage footer={footer}>
        <AuthHeading
          icon={<CheckCircle2 size={22} aria-hidden="true" />}
          title="Your password has been changed"
          subtitle="Every other session was logged out. Log in with your new password to continue."
        />
        <Link className="primary-button acct-button" href="/login">
          Log in
        </Link>
      </AuthPage>
    );
  }

  if (!token || linkError) {
    return (
      <AuthPage footer={footer}>
        <AuthHeading
          icon={<LinkIcon size={22} aria-hidden="true" />}
          title="This link has expired"
          subtitle="Recovery links work once and expire after 1 hour. Request a new one to reset your password."
        />
        <Link className="primary-button acct-button" href="/forgot-password">
          Send a new recovery link
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage footer={footer}>
      <AuthHeading
        icon={<KeyRound size={22} aria-hidden="true" />}
        title="Choose a new password"
        subtitle="Changing your password logs you out of every other session."
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <form className="acct-form" onSubmit={resetPassword}>
        <PasswordField
          label="New password"
          value={password}
          onValueChange={setPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          autoFocus
        />
        <PasswordChecklist password={password} />
        <PasswordField
          label="Confirm new password"
          value={confirmation}
          onValueChange={setConfirmation}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
        <SubmitButton
          busy={isSubmitting}
          busyLabel="Saving password"
          disabled={!password || !confirmation}
        >
          Continue
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
