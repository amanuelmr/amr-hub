import Link from "next/link";
import type { ReactNode } from "react";
import { LandingNav } from "../components/landing/LandingNav";

/** Public guide pages share the landing page header and a short footer. */
export function GuideShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <LandingNav />
      <main id="main" className="guide-main">
        {children}
      </main>
      <footer className="guide-footer">
        <div className="lp-container guide-footer-inner">
          <Link href="/guides">All guides</Link>
          <Link href="/">AMR Hub home</Link>
          <Link href="/signup">Get it free</Link>
        </div>
      </footer>
    </div>
  );
}
