"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Circle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import {
  passwordRequirements,
  passwordScore,
  passwordStrengthLabel,
} from "./passwordRules";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label: string;
  hint?: ReactNode;
  onValueChange: (value: string) => void;
};

export function AuthField({ label, hint, onValueChange, ...input }: FieldProps) {
  const id = useId();
  return (
    <div className="acct-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        {...input}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {hint && <p className="acct-field-hint">{hint}</p>}
    </div>
  );
}

export function PasswordField({
  label = "Password",
  hint,
  onValueChange,
  ...input
}: Omit<FieldProps, "label" | "type"> & { label?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="acct-field">
      <label htmlFor={id}>{label}</label>
      <span className="acct-password">
        <input
          id={id}
          {...input}
          type={visible ? "text" : "password"}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      </span>
      {hint && <p className="acct-field-hint">{hint}</p>}
    </div>
  );
}

/** Live strength meter + requirements checklist under a new password. */
export function PasswordChecklist({ password }: { password: string }) {
  const score = passwordScore(password);
  const rules = passwordRequirements(password);
  return (
    <div className="acct-checklist" aria-live="polite">
      <div className="acct-strength">
        <span className="acct-strength-bars" data-score={score}>
          {Array.from({ length: 4 }, (_, index) => (
            <i className={index < score ? "on" : ""} key={index} />
          ))}
        </span>
        <span className="acct-strength-label">
          {passwordStrengthLabel(password)}
        </span>
      </div>
      <ul>
        {rules.map((rule) => (
          <li className={rule.met ? "met" : ""} key={rule.id}>
            {rule.met ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Circle size={11} aria-hidden="true" />
            )}
            <span>
              {rule.label}
              {!rule.required && <em> (recommended)</em>}
            </span>
            <span className="sr-only">{rule.met ? " — met" : " — not met"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmailChip({
  email,
  onChange,
  changeLabel = "Change",
}: {
  email: string;
  onChange?: () => void;
  changeLabel?: string;
}) {
  return (
    <div className="acct-email-chip">
      <span className="acct-email-avatar" aria-hidden="true">
        {email.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="acct-email-text">{email}</span>
      {onChange && (
        <button type="button" className="acct-link-button" onClick={onChange}>
          {changeLabel}
        </button>
      )}
    </div>
  );
}

export function SubmitButton({
  children,
  busy,
  busyLabel,
  disabled,
  variant = "primary",
  type = "submit",
  onClick,
  icon,
}: {
  children: ReactNode;
  busy?: boolean;
  busyLabel?: ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  type?: "submit" | "button";
  onClick?: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      className={`${variant === "primary" ? "primary-button" : "secondary-button"} acct-button`}
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <LoaderCircle className="spinning-icon" size={16} aria-hidden="true" />
      ) : (
        icon
      )}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
