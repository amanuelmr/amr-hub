import type { Metadata } from "next";
import { CustomFieldsAdmin } from "../../components/fields/CustomFieldsAdmin";

export const metadata: Metadata = { title: "Custom fields" };

export default function CustomFieldsPage() {
  return <CustomFieldsAdmin />;
}
