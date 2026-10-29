"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import QRCode from "qrcode";
import { authClient } from "../../lib/auth-client";

type Enrollment = {
  totpURI: string;
  backupCodes: string[];
};

type TwoFactorSettingsProps = {
  enabled: boolean;
  onStatusChange: () => Promise<void> | void;
};

function downloadBackupCodes(codes: string[]) {
  const content = [
    "AMR Hub two-factor backup codes",
    "Each code works once. Store these somewhere secure.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "amr-hub-backup-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
}

export default function TwoFactorSettings({
  enabled,
  onStatusChange,
}: TwoFactorSettingsProps) {
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!enrollment) return;

    let active = true;
    QRCode.toDataURL(enrollment.totpURI, {
      width: 208,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#17211b",
        light: "#ffffff",
      },
    }).then((dataUrl) => {
      if (active) setQrCode(dataUrl);
    });

    return () => {
      active = false;
    };
  }, [enrollment]);

  const beginEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsWorking(true);
    setStatus(null);
    setCopied(false);
    setQrCode(null);

    const result = await authClient.twoFactor.enable({
      password,
      issuer: "AMR Hub",
    });

    setIsWorking(false);

    // Only authenticator app enrollment is set up here, which returns a QR URI.
    if (result.error || !result.data || !("totpURI" in result.data)) {
      setStatus("The password is incorrect or enrollment could not start.");
      return;
    }

    setEnrollment(result.data);
    setBackupCodes([]);
    setPassword("");
    setStatus("Scan the code, then enter the current six-digit value.");
  };

  const confirmEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollment) return;
    setIsWorking(true);
    setStatus(null);

    const result = await authClient.twoFactor.verifyTotp({
      code: verificationCode,
    });

    setIsWorking(false);

    if (result.error) {
      setStatus("That authenticator code is invalid or expired.");
      return;
    }

    setBackupCodes(enrollment.backupCodes);
    setEnrollment(null);
    setVerificationCode("");
    setStatus("Two-factor authentication is active. Save the backup codes.");
    await onStatusChange();
  };

  const disable = async () => {
    setIsWorking(true);
    setStatus(null);

    const result = await authClient.twoFactor.disable({ password });

    setIsWorking(false);

    if (result.error) {
      setStatus("The password is incorrect or two-factor could not be disabled.");
      return;
    }

    setPassword("");
    setBackupCodes([]);
    setStatus("Two-factor authentication has been disabled.");
    await onStatusChange();
  };

  const regenerateCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsWorking(true);
    setStatus(null);
    setCopied(false);

    const result = await authClient.twoFactor.generateBackupCodes({ password });

    setIsWorking(false);

    if (result.error || !result.data) {
      setStatus("The password is incorrect or new codes could not be created.");
      return;
    }

    setPassword("");
    setBackupCodes(result.data.backupCodes);
    setStatus("New backup codes created. Every previous code is now invalid.");
  };

  const copyCodes = async () => {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
  };

  return (
    <section className="account-section two-factor-section">
      <header>
        <span>
          {enabled ? (
            <ShieldCheck size={17} aria-hidden="true" />
          ) : (
            <ShieldOff size={17} aria-hidden="true" />
          )}
        </span>
        <div>
          <h2>Two-factor authentication</h2>
          <p>
            {enabled
              ? "Authenticator protection is active on this account."
              : "Require an authenticator code after your password."}
          </p>
        </div>
        <span className={`security-state ${enabled ? "enabled" : ""}`}>
          {enabled ? "Enabled" : "Not enabled"}
        </span>
      </header>

      {!enabled && !enrollment && (
        <form className="account-form" onSubmit={beginEnrollment}>
          <label className="form-field">
            <span>Current password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div className="account-actions">
            <span />
            <button
              className="primary-button"
              type="submit"
              disabled={isWorking || !password}
            >
              {isWorking ? (
                <LoaderCircle
                  className="spinning-icon"
                  size={15}
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck size={15} aria-hidden="true" />
              )}
              Set up authenticator
            </button>
          </div>
        </form>
      )}

      {!enabled && enrollment && (
        <div className="two-factor-enrollment">
          <div className="totp-qr">
            {qrCode ? (
              <Image
                src={qrCode}
                width={208}
                height={208}
                alt="Authenticator setup QR code"
                unoptimized
              />
            ) : (
              <LoaderCircle
                className="spinning-icon"
                size={24}
                aria-label="Creating QR code"
              />
            )}
          </div>
          <div className="enrollment-instructions">
            <span className="step-label">Step 1</span>
            <strong>Scan with an authenticator app</strong>
            <p>
              Add this account in 1Password, Google Authenticator, Authy, or
              another TOTP app.
            </p>
            <form className="verification-form" onSubmit={confirmEnrollment}>
              <label className="form-field">
                <span>Six-digit code</span>
                <span className="challenge-input">
                  <KeyRound size={16} aria-hidden="true" />
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </span>
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={isWorking || verificationCode.length !== 6}
              >
                {isWorking ? (
                  <LoaderCircle
                    className="spinning-icon"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <Check size={15} aria-hidden="true" />
                )}
                Verify and enable
              </button>
            </form>
          </div>
        </div>
      )}

      {enabled && backupCodes.length === 0 && (
        <div className="two-factor-controls">
          <form onSubmit={regenerateCodes}>
            <label className="form-field">
              <span>Current password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button
              className="secondary-button"
              type="submit"
              disabled={isWorking || !password}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Replace backup codes
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={isWorking || !password}
              onClick={() => void disable()}
            >
              <ShieldOff size={15} aria-hidden="true" />
              Disable
            </button>
          </form>
        </div>
      )}

      {backupCodes.length > 0 && (
        <div className="backup-codes">
          <div>
            <strong>One-time backup codes</strong>
            <p>Each code can complete sign-in once if your authenticator is unavailable.</p>
          </div>
          <div className="backup-code-grid">
            {backupCodes.map((code) => (
              <code key={code}>{code}</code>
            ))}
          </div>
          <div className="backup-code-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void copyCodes()}
            >
              {copied ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy codes"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadBackupCodes(backupCodes)}
            >
              <Download size={15} aria-hidden="true" />
              Download
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setBackupCodes([])}
            >
              I stored them safely
            </button>
          </div>
        </div>
      )}

      {status && (
        <p className="account-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
