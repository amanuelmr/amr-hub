"use client";

import * as Popover from "@radix-ui/react-popover";
import { Columns3 } from "lucide-react";
import { COLUMNS, DEFAULT_COLUMNS, type ColumnId } from "./columns";

export function ColumnChooser({
  value,
  onChange,
}: {
  value: ColumnId[];
  onChange: (columns: ColumnId[]) => void;
}) {
  const toggle = (id: ColumnId) => {
    if (value.includes(id)) {
      if (value.length > 1) onChange(value.filter((column) => column !== id));
    } else {
      onChange(COLUMNS.map((column) => column.id).filter((column) => column === id || value.includes(column)));
    }
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="secondary-button" type="button">
          <Columns3 size={15} aria-hidden="true" />
          Columns
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="search-popover" align="end" sideOffset={6}>
          <p className="search-popover-title">Columns</p>
          <div className="search-column-list">
            {COLUMNS.map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={value.includes(column.id)}
                  onChange={() => toggle(column.id)}
                />
                {column.label}
              </label>
            ))}
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => onChange(DEFAULT_COLUMNS)}
          >
            Restore defaults
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
