"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { BoardSettings } from "./BoardSettings";
import { useProjectBoards } from "../../../components/board/useProjectBoards";
import { DEFAULT_BOARD_ID, type Project, type ProjectBoard } from "../../../data/projects";
import { parseJql } from "../../../data/jql";

/** Board settings for any of the project's boards, chosen with ?board=. */
export function BoardsAdmin({
  project,
  readOnly,
}: {
  project: Project;
  readOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { boards, update, remove } = useProjectBoards(project.id);
  const boardId = searchParams.get("board") ?? DEFAULT_BOARD_ID;
  const board = boards?.find((candidate) => candidate.id === boardId) ?? boards?.[0];

  const selectBoard = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === DEFAULT_BOARD_ID) params.delete("board");
    else params.set("board", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!boards || !board) return <p className="field-meta">Loading boards…</p>;

  return (
    <div className="boards-admin">
      {boards.length > 1 && (
        <label className="form-field boards-admin-picker">
          <span>Board</span>
          <select value={board.id} onChange={(event) => selectBoard(event.target.value)}>
            {boards.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
                {candidate.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {!board.isDefault && (
        <BoardDetails
          key={board.id}
          board={board}
          readOnly={readOnly}
          onSave={(input) => update(board.id, input)}
          onDelete={async () => {
            await remove(board.id);
            selectBoard(DEFAULT_BOARD_ID);
          }}
        />
      )}
      <BoardSettings
        // Remount when the board or its saved configuration changes.
        key={`${board.id}-${JSON.stringify(board.isDefault ? project.boardConfig : board.config)}`}
        project={project}
        readOnly={readOnly}
        board={board}
        onSaveBoard={(config) => update(board.id, { config })}
      />
    </div>
  );
}

function BoardDetails({
  board,
  readOnly,
  onSave,
  onDelete,
}: {
  board: ProjectBoard;
  readOnly: boolean;
  onSave: (input: { name: string; filterJql: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(board.name);
  const [filterJql, setFilterJql] = useState(board.filterJql ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const save = async () => {
    const jql = filterJql.trim();
    if (name.trim().length < 2) {
      setMessage({ ok: false, text: "Give the board a name of at least 2 characters." });
      return;
    }
    if (jql) {
      const parsed = parseJql(jql, new Date(), { customFields: "any" });
      if (!parsed.ok) {
        setMessage({ ok: false, text: `The filter is not valid JQL: ${parsed.error.message}` });
        return;
      }
    }
    try {
      await onSave({ name: name.trim(), filterJql: jql || null });
      setMessage({ ok: true, text: "Board details saved." });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Board details could not be saved.",
      });
    }
  };

  return (
    <section className="boards-admin-details">
      <h3>Board details</h3>
      <label className="form-field">
        <span>Name</span>
        <input
          value={name}
          maxLength={60}
          disabled={readOnly}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Filter (JQL)</span>
        <input
          value={filterJql}
          maxLength={2000}
          disabled={readOnly}
          placeholder="Leave empty to show all of the project's work"
          onChange={(event) => setFilterJql(event.target.value)}
        />
      </label>
      {message && (
        <p className={message.ok ? "field-meta" : "form-submit-error"} role="status">
          {message.text}
        </p>
      )}
      {!readOnly && (
        <div className="pa-dialog-actions">
          {confirming ? (
            <>
              <span className="field-meta">Delete {board.name}? Its issues stay in the project.</span>
              <button className="secondary-button" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={() => void onDelete()}>
                Delete board
              </button>
            </>
          ) : (
            <>
              <button className="danger-button" type="button" onClick={() => setConfirming(true)}>
                <Trash2 size={14} aria-hidden="true" />
                Delete board
              </button>
              <button className="primary-button" type="button" onClick={() => void save()}>
                Save details
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
