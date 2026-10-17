import { PeopleDirectory } from "../components/people/PeopleDirectory";

export const metadata = { title: "Teams" };

export default function TeamsPage() {
  return <PeopleDirectory initialTab="teams" />;
}
