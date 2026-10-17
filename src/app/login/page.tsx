"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import {
  AuthAlert,
  AuthDivider,
  AuthFooterLinks,
  AuthHeading,
  AuthPage,
} from "../components/auth/AuthCard";
import {
  AuthField,
  EmailChip,
  PasswordField,
  SubmitButton,
} from "../components/auth/AuthFields";

type Step = "email" | "password";

export default function LoginPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningInWithPasskey, setIsSigningInWithPasskey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [router, session]);

  useEffect(() => {
    if (step === "password") {
      passwordRef.current?.querySelector("input")?.focus();
    }
  }, [step]);

  const goToWorkspace = async () => {
    const organizations = await authClient.organization.list();

    if (!organizations.error && organizations.data.length === 0) {
      router.replace("/onboarding");
      return;
    }

    if (!organizations.error && organizations.data[0]) {
      await authClient.organization.setActive({
        organizationId: organizations.data[0].id,
      });
    }

    router.replace("/dashboard");
    router.refresh();
  };

  const continueWithEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) return;
    setStep("password");
  };

  const changeEmail = () => {
    setStep("email");
    setPassword("");
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
      rememberMe,
      callbackURL: "/onboarding",
    });

    if (result.error) {
      if (result.error.status === 429) {
        setError("Too many attempts. Wait a minute and try again.");
      } else if (result.error.code === "ACCOUNT_LOCKED") {
        setError(
          result.error.message ?? "Too many failed attempts. Try again shortly.",
        );
      } else if (result.error.status === 403) {
        setNotice(
          `Verify your email before logging in. We just sent a new verification link to ${email.trim()}.`,
        );
      } else {
        setError("Incorrect email address and / or password.");
      }
      setIsSubmitting(false);
      return;
    }

    if (result.data && "twoFactorRedirect" in result.data) {
      return;
    }

    await goToWorkspace();
  };

  const handlePasskeySignIn = async () => {
    setError(null);
    setNotice(null);
    setIsSigningInWithPasskey(true);

    const result = await authClient.signIn.passkey();
    setIsSigningInWithPasskey(false);

    if (result?.error) {
      setError(
        "Passkey sign-in did not complete. Try again or use your password.",
      );
      return;
    }

    await goToWorkspace();
  };

  return (
    <AuthPage
      footer={
        <AuthFooterLinks>
          {[
            <Link href="/forgot-password" key="cant">
              Can&apos;t log in?
            </Link>,
            <Link href="/signup" key="create">
              Create an account
            </Link>,
          ]}
        </AuthFooterLinks>
      }
    >
      <AuthHeading
        title="Log in to continue"
        subtitle={
          step === "email"
            ? "Use your AMR Hub account to open your workspace."
            : "Enter your password to log in."
        }
      />

      {error && <AuthAlert>{error}</AuthAlert>}
      {notice && <AuthAlert tone="info">{notice}</AuthAlert>}

      {step === "email" ? (
        <>
          <form className="acct-form" onSubmit={continueWithEmail}>
            <AuthField
              label="Email"
              type="email"
              value={email}
              onValueChange={setEmail}
              autoComplete="username webauthn"
              inputMode="email"
              placeholder="Enter your email"
              required
              autoFocus
            />
            <SubmitButton disabled={!email.trim()}>Continue</SubmitButton>
          </form>

          <AuthDivider />

          <SubmitButton
            type="button"
            variant="secondary"
            onClick={() => void handlePasskeySignIn()}
            busy={isSigningInWithPasskey}
            busyLabel="Waiting for passkey"
            icon={<Fingerprint size={16} aria-hidden="true" />}
          >
            Log in with passkey
          </SubmitButton>
        </>
      ) : (
        <form className="acct-form" onSubmit={handleSubmit}>
          <EmailChip email={email.trim()} onChange={changeEmail} />
          {/* Keeps the username available to password managers. */}
          <input
            className="sr-only"
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <div ref={passwordRef}>
            <PasswordField
              value={password}
              onValueChange={setPassword}
              autoComplete="current-password"
              placeholder="Enter password"
              required
            />
          </div>

          <div className="acct-row">
            <label className="acct-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember me
            </label>
            <Link className="acct-inline-link" href="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <SubmitButton
            busy={isSubmitting}
            busyLabel="Logging in"
            disabled={!email.trim() || !password}
          >
            Log in
          </SubmitButton>
        </form>
      )}
    </AuthPage>
  );
}
