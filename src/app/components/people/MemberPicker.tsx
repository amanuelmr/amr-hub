"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { PersonAvatar } from "./PersonAvatar";
import { matchesQuery } from "./peopleUtils";

export type PickablePerson = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

/** Jira-style people picker: selected chips plus a searchable suggestion list. */
export function MemberPicker({
  people,
  selectedIds,
  onChange,
  label = "Members",
  excludeIds = [],
}: {
  people: PickablePerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const byId = new Map(people.map((person) => [person.userId, person]));
  const selected = selectedIds.flatMap((id) => {
    const person = byId.get(id);
    return person ? [person] : [];
  });
  const suggestions = people.filter(
    (person) =>
      !selectedIds.includes(person.userId) &&
      !excludeIds.includes(person.userId) &&
      matchesQuery(query, person.name, person.email),
  );

  return (
    <div className="people-picker">
      <span className="people-picker-label">{label}</span>
      {selected.length > 0 && (
        <ul className="people-picker-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((person) => (
            <li key={person.userId} className="people-chip">
              <PersonAvatar {...person} size={18} />
              <span>{person.name}</span>
              <button
                type="button"
                aria-label={`Remove ${person.name}`}
                onClick={() => onChange(selectedIds.filter((id) => id !== person.userId))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="people-picker-search">
        <Search size={13} aria-hidden="true" />
        <span className="sr-only">Search people</span>
        <input
          value={query}
          placeholder="Search by name or email"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className="people-picker-options" role="listbox" aria-label="People">
        {suggestions.length === 0 ? (
          <li className="people-picker-empty">
            {query ? "No matching people" : "Everyone is already added"}
          </li>
        ) : (
          suggestions.slice(0, 50).map((person) => (
            <li key={person.userId}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange([...selectedIds, person.userId]);
                  setQuery("");
                }}
              >
                <PersonAvatar {...person} size={22} />
                <span className="people-picker-name">
                  {person.name}
                  <small>{person.email}</small>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
