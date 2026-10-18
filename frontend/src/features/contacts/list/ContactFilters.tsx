import { type FormEvent, useId, useState } from "react";
import { Button } from "../../../components/Button";
import { TagChip } from "../../../components/TagChip";
import ui from "../../../components/ui.module.css";
import { type ListState, MIN_SEARCH_LENGTH, normalizeTagInput, TAG_PATTERN } from "./listParams";
import styles from "./ContactsPage.module.css";
import { useSyncedTextInput } from "./useSyncedTextInput";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A → Z" },
  { value: "name:desc", label: "Name Z → A" },
] as const;

interface Props {
  state: ListState;
  onChange: (change: Partial<ListState>, options?: { replace?: boolean }) => void;
}

export function ContactFilters({ state, onChange }: Props) {
  const ids = {
    search: useId(),
    searchHint: useId(),
    company: useId(),
    tag: useId(),
    sort: useId(),
  };

  // Search: debounced, written to the URL without adding a history entry per keystroke.
  const search = useSyncedTextInput(state.q, (q) => onChange({ q }, { replace: true }), {
    minLength: MIN_SEARCH_LENGTH,
  });

  // Company is an exact match, so it's applied on Enter or when leaving the field,
  // not while typing (a half-typed name would always match nothing).
  const [company, setCompany] = useState(state.company);
  const [seenCompany, setSeenCompany] = useState(state.company);
  if (state.company !== seenCompany) {
    setSeenCompany(state.company);
    setCompany(state.company);
  }
  const applyCompany = () => {
    if (company.trim() !== state.company) onChange({ company: company.trim() });
  };

  const [tagText, setTagText] = useState("");
  const [tagError, setTagError] = useState<string>();
  const addTagFilter = (event: FormEvent) => {
    event.preventDefault();
    const tag = normalizeTagInput(tagText);
    if (!tag) return;
    if (!TAG_PATTERN.test(tag)) {
      setTagError("Tags use letters, digits, spaces, - and _ (up to 40 characters)");
      return;
    }
    setTagError(undefined);
    setTagText("");
    if (!state.tags.includes(tag)) onChange({ tags: [...state.tags, tag] });
  };

  const hasFilters = state.q !== "" || state.company !== "" || state.tags.length > 0;

  return (
    <div className={styles.filters} role="search" aria-label="Search and filter contacts">
      <div className={ui.field}>
        <label htmlFor={ids.search} className={ui.label}>
          Search
        </label>
        <input
          id={ids.search}
          type="search"
          className={ui.input}
          placeholder="Name, email, or phone"
          value={search.text}
          onChange={(e) => search.setText(e.target.value)}
          aria-describedby={ids.searchHint}
          maxLength={100}
        />
        <span id={ids.searchHint} className={ui.hint} aria-live="polite">
          {search.tooShort
            ? `Type at least ${MIN_SEARCH_LENGTH} characters`
            : "Matches the start of names, emails, and phone numbers"}
        </span>
      </div>

      <div className={ui.field}>
        <label htmlFor={ids.company} className={ui.label}>
          Company
        </label>
        <input
          id={ids.company}
          className={ui.input}
          placeholder="Exact name, then Enter"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onBlur={applyCompany}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyCompany();
          }}
          maxLength={200}
        />
      </div>

      <form className={ui.field} onSubmit={addTagFilter}>
        <label htmlFor={ids.tag} className={ui.label}>
          Has tags
        </label>
        <input
          id={ids.tag}
          className={ui.input}
          placeholder="Tag, then Enter"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          aria-invalid={tagError ? true : undefined}
          aria-describedby={tagError ? `${ids.tag}-error` : undefined}
          maxLength={40}
        />
        {tagError && (
          <span id={`${ids.tag}-error`} className={ui.fieldError}>
            {tagError}
          </span>
        )}
      </form>

      <div className={ui.field}>
        <label htmlFor={ids.sort} className={ui.label}>
          Sort
        </label>
        <select
          id={ids.sort}
          className={ui.input}
          value={`${state.sortBy}:${state.sortOrder}`}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split(":") as [
              ListState["sortBy"],
              ListState["sortOrder"],
            ];
            onChange({ sortBy, sortOrder });
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {(state.tags.length > 0 || hasFilters) && (
        <div className={styles.activeFilters}>
          {state.tags.length > 0 && (
            <ul className={styles.chipList} aria-label="Tag filters (contacts must have all)">
              {state.tags.map((tag) => (
                <li key={tag}>
                  <TagChip
                    tag={tag}
                    onRemove={() => onChange({ tags: state.tags.filter((t) => t !== tag) })}
                  />
                </li>
              ))}
            </ul>
          )}
          {hasFilters && (
            <Button onClick={() => onChange({ q: "", company: "", tags: [] })}>
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
