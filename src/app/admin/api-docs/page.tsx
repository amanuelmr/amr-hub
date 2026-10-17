import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApiDocsView } from "../../components/admin/ApiDocsView";

export const metadata: Metadata = { title: "REST API" };

export default async function ApiDocsPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = host
    ? `${protocol}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return <ApiDocsView baseUrl={baseUrl} />;
}
