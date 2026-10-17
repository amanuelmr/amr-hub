"use client";

import { useMemo, useRef, useState } from "react";
import { CircleAlert, Search } from "lucide-react";
import {
  applyJqlSuggestion,
  getJqlSuggestions,
  type JqlError,
  type JqlSuggestionSource,
} from "../../data/jql";

type JqlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  source: JqlSuggestionSource;
  error: JqlError | null;
};

export function JqlEditor({ value, onChange, onSearch, source, error }: JqlEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(
    () => getJqlSuggestions(value, Math.min(caret, value.length), source),
    [value, caret, source],
  );
  const showList = isOpen && suggestions.items.length > 0;

  const syncCaret = () => {
    const element = inputRef.current;
    if (element) setCaret(element.selectionStart ?? element.value.length);
  };

  const accept = (index: number) => {
    const suggestion = suggestions.items[index];
    if (!suggestion) return;
    const next = applyJqlSuggestion(value, suggestions, suggestion);
    onChange(next.text);
    setCaret(next.caret);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="jql-editor">
      <div className={error ? "jql-input-row invalid" : "jql-input-row"}>
        <span className="jql-badge" aria-hidden="true">
          JQL
        </span>
        <div className="jql-input-wrap">
          <textarea
            ref={inputRef}
            className="jql-input"
            value={value}
            rows={1}
            spellCheck={false}
            role="combobox"
            aria-label="JQL query"
            aria-invalid={!!error}
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls="jql-suggestions"
            placeholder='project = AMR AND assignee = currentUser() ORDER BY priority DESC'
            onChange={(event) => {
              onChange(event.target.value);
              setCaret(event.target.selectionStart ?? event.target.value.length);
              setIsOpen(true);
              setActiveIndex(0);
            }}
            onClick={syncCaret}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                syncCaret();
              }
            }}
            onFocus={() => {
              syncCaret();
              setIsOpen(true);
            }}
            onBlur={() => setTimeout(() => setIsOpen(false), 120)}
            onKeyDown={(event) => {
              if (showList && event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => Math.min(current + 1, suggestions.items.length - 1));
              } else if (showList && event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (showList && event.key === "Tab") {
                event.preventDefault();
                accept(activeIndex);
              } else if (event.key === "Escape") {
                setIsOpen(false);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (showList && !(event.metaKey || event.ctrlKey)) {
                  accept(activeIndex);
                } else {
                  setIsOpen(false);
                  onSearch();
                }
              } else if (event.key === " " && event.ctrlKey) {
                event.preventDefault();
                setIsOpen(true);
              }
            }}
          />
          {showList && (
            <ul className="jql-suggestions" id="jql-suggestions" role="listbox">
              {suggestions.items.map((item, index) => (
                <li
                  key={`${item.kind}-${item.label}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    accept(index);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className={`jql-suggestion-kind kind-${item.kind}`}>{item.kind}</span>
                  <span className="jql-suggestion-label">{item.label}</span>
                  {item.detail && <small>{item.detail}</small>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="primary-button" type="button" onClick={onSearch}>
          <Search size={15} aria-hidden="true" />
          Search
        </button>
      </div>
      {error ? (
        <p className="jql-error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          <span>
            {error.message}
            <small> (character {error.position + 1})</small>
          </span>
        </p>
      ) : (
        <p className="jql-hint">
          Enter to accept a suggestion · Ctrl+Enter or Search to run · Tab completes
        </p>
      )}
    </div>
  );
}
