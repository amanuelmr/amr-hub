import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GuideShell } from "./GuideShell";
import { GUIDES } from "./guides";

export const metadata: Metadata = {
  title: "Guides",
  description: "How-to guides for getting more out of AMR Hub.",
};

export default function GuidesPage() {
  return (
    <GuideShell>
      <section className="lp-section">
        <div className="lp-container">
          <h1 className="lp-h2">Guides</h1>
          <p className="lp-section-lede">Short, practical guides for getting more out of AMR Hub.</p>
          <ul className="guide-list">
            {GUIDES.map((guide) => (
              <li key={guide.slug} className={`lp-latest-card lp-tone-${guide.tone}`}>
                <div className="lp-latest-body">
                  <span className="lp-latest-tag">Guide</span>
                  <h2>{guide.title}</h2>
                  <p>{guide.summary}</p>
                  <Link href={`/guides/${guide.slug}`}>
                    Read the guide <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </GuideShell>
  );
}
