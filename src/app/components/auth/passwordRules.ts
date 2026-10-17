/**
 * Client-side password guidance for the account screens. The server
 * (Better Auth: 12–128 characters) remains the source of truth; only the
 * length rule blocks submission, the rest are advisory strength signals.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordRequirement = {
  id: "length" | "variety" | "mixed" | "unique";
  label: string;
  met: boolean;
  required: boolean;
};

export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met:
        password.length >= MIN_PASSWORD_LENGTH &&
        password.length <= MAX_PASSWORD_LENGTH,
      required: true,
    },
    {
      id: "mixed",
      label: "Letters and numbers",
      met: /[a-zA-Z]/.test(password) && /[0-9]/.test(password),
      required: false,
    },
    {
      id: "variety",
      label: "A symbol or a space",
      met: /\s/.test(password) || /[^a-zA-Z0-9]/.test(password),
      required: false,
    },
    {
      id: "unique",
      label: "At least 10 different characters",
      met: new Set(password).size >= 10,
      required: false,
    },
  ];
}

/** 0–4 score used by the strength meter. */
export function passwordScore(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (new Set(password).size >= 10) score += 1;
  if (/\s/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;
  return password.length < MIN_PASSWORD_LENGTH ? Math.min(score, 1) : score;
}

export function passwordStrengthLabel(password: string) {
  if (!password) return "Enter a password";
  if (password.length < MIN_PASSWORD_LENGTH) return "Too short";
  const score = passwordScore(password);
  if (score >= 4) return "Very strong";
  if (score === 3) return "Strong";
  return "Fair";
}

export function isPasswordAcceptable(password: string) {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}
