"use client";

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { PICKER_EMOJI, QUICK_REACTIONS } from "../data/reactions";

/**
 * Small emoji grid in a popover. Used for comment reactions ("Add reaction")
 * and by the rich-text editor's emoji button.
 */
export function EmojiPicker({
  trigger,
  onPick,
  label = "Choose an emoji",
  align = "start",
}: {
  trigger: ReactNode;
  onPick: (emoji: string) => void;
  label?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const emoji = [...QUICK_REACTIONS, ...PICKER_EMOJI];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="issue-popover emoji-picker"
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          // Keep focus in the editor when used from the toolbar.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <p className="issue-popover-heading">{label}</p>
          <div className="emoji-picker-grid" role="listbox" aria-label={label}>
            {emoji.map((value) => (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={false}
                className="emoji-picker-option"
                title={value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(value);
                  setOpen(false);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
