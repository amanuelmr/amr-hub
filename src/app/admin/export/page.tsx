import type { Metadata } from "next";
import { ExportView } from "../../components/admin/ExportView";

export const metadata: Metadata = { title: "Export" };

export default function ExportPage() {
  return <ExportView />;
}
