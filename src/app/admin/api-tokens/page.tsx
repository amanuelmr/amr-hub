import type { Metadata } from "next";
import { ApiTokensView } from "../../components/admin/ApiTokensView";

export const metadata: Metadata = { title: "API tokens" };

export default function ApiTokensPage() {
  return <ApiTokensView />;
}
