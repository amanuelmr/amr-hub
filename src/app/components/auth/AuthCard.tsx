import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

/**
 * Atlassian-style account layout: a calm page, one centered card with the
 * product brand on top, and a footer of links + a small legal line below.
 */
export function AuthPage({
  children,
  footer,
  legal,
  wide = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  legal?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="acct-page">
      <div className={wide ? "acct-column acct-column-wide" : "acct-column"}>
        <section className={wide ? "acct-card acct-card-wide" : "acct-card"}>
          <AuthBrand />
          {children}
        </section>
        {footer && <nav className="acct-footer-links">{footer}</nav>}
        <footer className="acct-legal">
          {legal && <p>{legal}</p>}
          <p className="acct-legal-brand">
            <span className="acct-legal-mark" aria-hidden="true">
              A
            </span>
            AMR Hub
          </p>
          <p>One account for every AMR Hub workspace.</p>
        </footer>
      </div>
    </div>
  );
}

export function AuthBrand() {
  return (
    <Link className="acct-brand" href="/" aria-label="AMR Hub home">
      <span className="brand-mark acct-brand-mark" aria-hidden="true">
        A
      </span>
      <span className="acct-brand-name">AMR Hub</span>
    </Link>
  );
}

export function AuthHeading({
  title,
  subtitle,
  icon,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="acct-heading">
      {icon && <span className="acct-heading-icon">{icon}</span>}
      {eyebrow && <p className="acct-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {subtitle && <p className="acct-subtitle">{subtitle}</p>}
    </header>
  );
}

export function AuthAlert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  const Icon =
    tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={`acct-alert acct-alert-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function AuthDivider({ label = "Or continue with" }: { label?: string }) {
  return (
    <div className="acct-divider" role="separator">
      <span>{label}</span>
    </div>
  );
}

/** Joins footer links with the Atlassian-style bullet separator. */
export function AuthFooterLinks({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <>
      {items.map((item, index) => (
        <span className="acct-footer-item" key={index}>
          {index > 0 && (
            <span className="acct-footer-dot" aria-hidden="true">
              •
            </span>
          )}
          {item}
        </span>
      ))}
    </>
  );
}

export function AuthLoading({ label }: { label: string }) {
  return (
    <div className="acct-page acct-page-loading" role="status">
      <span className="acct-loading">
        <span className="acct-loading-dot" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
