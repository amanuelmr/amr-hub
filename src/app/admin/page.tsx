import type { Metadata } from "next";
import { GeneralView } from "../components/admin/GeneralView";

export const metadata: Metadata = { title: "Workspace settings" };

export default function AdminGeneralPage() {
  return <GeneralView />;
}
