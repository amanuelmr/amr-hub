"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";
import {
  AuthAlert,
  AuthFooterLinks,
  AuthHeading,
  AuthPage,
} from "../../components/auth/AuthCard";
import {
  AuthField,
  PasswordChecklist,
  PasswordField,
  SubmitButton,
} from "../../components/auth/AuthFields";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
} from "../../components/auth/passwordRules";

export default function RecoveryCodeResetPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

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
    const response = await fetch("/api/recovery-codes/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        code: code.trim(),
        newPassword: password,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setIsSubmitting(false);

    if (!response.ok) {
      setError(result?.error ?? "The password could not be reset.");
      return;
    }

    setPassword("");
    setConfirmation("");
    setCode("");
    setIsComplete(true);
  };

  const footer = (
    <AuthFooterLinks>
      {[
        <Link href="/login" key="login">
          Return to log in
        </Link>,
        <Link href="/forgot-password" key="email">
          Send a recovery link instead
        </Link>,
      ]}
    </AuthFooterLinks>
  );

  if (isComplete) {
    return (
      <AuthPage footer={footer}>
        <AuthHeading
          icon={<CheckCircle2 size={22} aria-hidden="true" />}
          title="Your password has been changed"
          subtitle="Every existing session and recovery code was invalidated. Log in with your new password, then create a fresh set of recovery codes."
        />
        <Link className="primary-button acct-button" href="/login">
          Log in
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage footer={footer}>
      <AuthHeading
        icon={<KeyRound size={22} aria-hidden="true" />}
        title="Use a recovery code"
        subtitle="Enter one of the password recovery codes you saved earlier. Each code works once."
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <form className="acct-form" onSubmit={resetPassword}>
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
        <AuthField
          label="Recovery code"
          className="acct-code-input"
          type="text"
          value={code}
          onValueChange={setCode}
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={64}
          placeholder="AMR-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          required
        />
        <PasswordField
          label="New password"
          value={password}
          onValueChange={setPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
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
          busyLabel="Resetting password"
          disabled={!email.trim() || !code.trim() || !password || !confirmation}
        >
          Reset password
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
