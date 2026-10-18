import type { Metadata } from "next";
import "./globals.css";
import "./retro.css";
import "./styles/jira-shell.css";
import "./styles/shell.css";
import "./styles/board.css";
import "./styles/backlog.css";
import "./styles/issue-detail.css";
import "./styles/collab.css";
import "./styles/create-issue.css";
import "./styles/project-admin.css";
import "./styles/workflow-admin.css";
import "./styles/reports.css";
import "./styles/search.css";
import "./styles/admin.css";
import "./styles/goals-forms.css";
import "./styles/people.css";
import "./styles/auth.css";
import "./styles/landing.css";
import "./styles/custom-fields.css";
import "./styles/notifications.css";
import "./styles/automation.css";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "AMR Hub",
    template: "%s | AMR Hub",
  },
  description:
    "A focused issue triage and product delivery workspace for modern software teams.",
  openGraph: {
    title: "AMR Hub",
    description: "Track the work that needs attention.",
    type: "website",
    images: [
      {
        url: "/og-retro.png",
        width: 1729,
        height: 910,
        alt: "AMR Hub retro operations console",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AMR Hub",
    description: "Track the work that needs attention.",
    images: ["/og-retro.png"],
  },
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("amr-hub-theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (error) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
