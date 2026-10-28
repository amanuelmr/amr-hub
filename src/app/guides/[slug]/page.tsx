import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GuideShell } from "../GuideShell";
import { GUIDES, findGuide } from "../guides";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = findGuide((await params).slug);
  return guide ? { title: guide.title, description: guide.summary } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = findGuide((await params).slug);
  if (!guide) notFound();

  return (
    <GuideShell>
      <article className="lp-section guide-article">
        <div className="lp-container guide-container">
          <Link className="guide-back" href="/guides">
            <ArrowLeft size={14} aria-hidden="true" /> All guides
          </Link>
          <h1 className="lp-h2">{guide.title}</h1>
          <p className="lp-section-lede">{guide.summary}</p>
          {guide.sections.map((section) => (
            <section key={section.heading} className="guide-section">
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.steps && (
                <ol>
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
              {section.examples && (
                <dl className="guide-examples">
                  {section.examples.map((example) => (
                    <div key={example.code}>
                      <dt>{example.note}</dt>
                      <dd>
                        <code>{example.code}</code>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
          <p className="guide-cta">
            <Link className="primary-button lp-btn" href="/signup">
              Try it in AMR Hub
            </Link>
          </p>
        </div>
      </article>
    </GuideShell>
  );
}
