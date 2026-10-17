import { PeopleDirectory } from "../components/people/PeopleDirectory";

export const metadata = { title: "People" };

export default function PeoplePage() {
  return <PeopleDirectory initialTab="people" />;
}
