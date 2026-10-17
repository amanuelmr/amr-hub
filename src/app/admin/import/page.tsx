import type { Metadata } from "next";
import { ImportWizard } from "../../components/admin/ImportWizard";

export const metadata: Metadata = { title: "Import issues from CSV" };

export default function ImportPage() {
  return <ImportWizard />;
}
