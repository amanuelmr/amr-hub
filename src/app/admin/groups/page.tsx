import type { Metadata } from "next";
import { GroupsView } from "../../components/admin/GroupsView";

export const metadata: Metadata = { title: "Groups" };

export default function GroupsPage() {
  return <GroupsView />;
}
