"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import {
  AuthAlert,
  AuthHeading,
  AuthPage,
} from "../components/auth/AuthCard";
import {
  AuthField,
  EmailChip,
  PasswordChecklist,
  PasswordField,
  SubmitButton,
} from "../components/auth/AuthFields";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
} from "../components/auth/passwordRules";

type Step = "email" | "details" | "verify";

const RESEND_COOLDOWN_SECONDS = 30;

export default function SignupPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [step, setStep] = useState<Step>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (session) router.replace("/onboarding");
  }, [router, session]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const continueWithEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setStep("details");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isPasswordAcceptable(password)) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }

    setIsSubmitting(true);
    const result = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      callbackURL: "/onboarding",
    });

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many sign-up attempts. Wait a minute and try again."
          : "We couldn't create the account. If this email is already registered, log in instead.",
      );
      setIsSubmitting(false);
      return;
    }

    setPassword("");
    setIsSubmitting(false);

    if (!result.data.token) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep("verify");
      return;
    }

    router.replace("/onboarding");
    router.refresh();
  };

  const resendEmail = async () => {
    setResendStatus(null);
    setIsResending(true);
    const result = await authClient.sendVerificationEmail({
      email: email.trim(),
      callbackURL: "/onboarding",
    });
    setIsResending(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setResendStatus(
      result.error
        ? result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "We couldn't resend the email. Try again shortly."
        : "Email sent. It can take a minute to arrive.",
    );
  };

  const legal = "By signing up, I accept the AMR Hub terms of service and acknowledge the privacy policy.";

  if (step === "verify") {
    return (
      <AuthPage
        footer={
          <Link href="/login">Already verified? Log in</Link>
        }
      >
        <AuthHeading
          icon={<MailCheck size={22} aria-hidden="true" />}
          title="Check your inbox to verify your email"
          subtitle="To complete sign up, open the link we sent to:"
        />
        <EmailChip email={email.trim()} />
        <p className="acct-body">
          The link expires in 24 hours. If you don&apos;t see the email, check
          your spam folder. If {email.trim()} already has an account, log in
          instead.
        </p>
        {resendStatus && (
          <AuthAlert
            tone={resendStatus.startsWith("Email sent") ? "success" : "error"}
          >
            {resendStatus}
          </AuthAlert>
        )}
        <div className="acct-stack">
          <SubmitButton
            type="button"
            variant="secondary"
            onClick={() => void resendEmail()}
            busy={isResending}
            busyLabel="Sending"
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
          </SubmitButton>
          <Link className="primary-button acct-button" href="/login">
            Back to log in
          </Link>
        </div>
        <p className="acct-body acct-muted">
          Wrong email?{" "}
          <button
            type="button"
            className="acct-link-button"
            onClick={() => {
              setStep("email");
              setResendStatus(null);
            }}
          >
            Sign up with a different email
          </button>
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      footer={<Link href="/login">Already have an account? Log in</Link>}
    >
      <AuthHeading
        title="Sign up to continue"
        subtitle={
          step === "email"
            ? "Create your AMR Hub account. You'll set up your workspace next."
            : "Tell us a little about yourself."
        }
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      {step === "email" ? (
        <form className="acct-form" onSubmit={continueWithEmail}>
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
          <p className="acct-fine-print">{legal}</p>
          <SubmitButton disabled={!email.trim()}>Sign up</SubmitButton>
        </form>
      ) : (
        <form className="acct-form" onSubmit={handleSubmit}>
          <EmailChip
            email={email.trim()}
            onChange={() => {
              setStep("email");
              setError(null);
            }}
          />
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
            label="Password"
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
            busyLabel="Creating account"
            disabled={
              name.trim().length < 2 || !isPasswordAcceptable(password)
            }
          >
            Continue
          </SubmitButton>
        </form>
      )}
    </AuthPage>
  );
}
