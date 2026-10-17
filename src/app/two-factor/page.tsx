"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import {
  AuthAlert,
  AuthFooterLinks,
  AuthHeading,
  AuthPage,
} from "../components/auth/AuthCard";
import { AuthField, SubmitButton } from "../components/auth/AuthFields";

type ChallengeMethod = "totp" | "backup";

export default function TwoFactorPage() {
  const router = useRouter();
  const [method, setMethod] = useState<ChallengeMethod>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMethod = (next: ChallengeMethod) => {
    setMethod(next);
    setCode("");
    setError(null);
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp({
            code: code.replace(/\s/g, ""),
            trustDevice,
          })
        : await authClient.twoFactor.verifyBackupCode({
            code: code.trim(),
            trustDevice,
          });

    setIsSubmitting(false);

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many failed attempts. Try again in 15 minutes."
          : method === "totp"
            ? "That verification code is invalid or expired."
            : "That backup code is invalid or has already been used.",
      );
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <AuthPage
      footer={
        <AuthFooterLinks>
          {[
            <Link href="/login" key="login">
              Log in with a different account
            </Link>,
            <Link href="/forgot-password" key="cant">
              Can&apos;t log in?
            </Link>,
          ]}
        </AuthFooterLinks>
      }
    >
      <AuthHeading
        icon={<ShieldCheck size={22} aria-hidden="true" />}
        title="Verify it's you"
        subtitle={
          method === "totp"
            ? "Enter the 6-digit verification code from your authenticator app."
            : "Enter one of the backup codes you saved when you turned on two-step verification."
        }
      />

      <div
        className="acct-tabs"
        role="tablist"
        aria-label="Verification method"
      >
        <button
          type="button"
          role="tab"
          aria-selected={method === "totp"}
          className={method === "totp" ? "active" : ""}
          onClick={() => switchMethod("totp")}
        >
          Authenticator app
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "backup"}
          className={method === "backup" ? "active" : ""}
          onClick={() => switchMethod("backup")}
        >
          Backup code
        </button>
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <form className="acct-form" onSubmit={verify}>
        <AuthField
          key={method}
          label={method === "totp" ? "Verification code" : "Backup code"}
          className="acct-code-input"
          type="text"
          value={code}
          onValueChange={(value) =>
            setCode(
              method === "totp" ? value.replace(/\D/g, "").slice(0, 6) : value,
            )
          }
          inputMode={method === "totp" ? "numeric" : "text"}
          autoComplete="one-time-code"
          spellCheck={false}
          minLength={method === "totp" ? 6 : 1}
          maxLength={method === "totp" ? 6 : 64}
          placeholder={method === "totp" ? "000000" : "Enter backup code"}
          autoFocus
          required
        />

        <label className="acct-checkbox">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
          />
          Don&apos;t ask again on this device for 30 days
        </label>

        <SubmitButton
          busy={isSubmitting}
          busyLabel="Verifying"
          disabled={method === "totp" ? code.length !== 6 : !code}
        >
          Verify
        </SubmitButton>
      </form>

      <p className="acct-body acct-muted">
        {method === "totp" ? (
          <>
            Don&apos;t have your phone?{" "}
            <button
              type="button"
              className="acct-link-button"
              onClick={() => switchMethod("backup")}
            >
              Use a backup code
            </button>
          </>
        ) : (
          <>
            Have your authenticator?{" "}
            <button
              type="button"
              className="acct-link-button"
              onClick={() => switchMethod("totp")}
            >
              Use a verification code
            </button>
          </>
        )}
      </p>
    </AuthPage>
  );
}
