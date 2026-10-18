import type { Metadata } from "next";
import { TrashView } from "../../components/admin/TrashView";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return <TrashView />;
}
