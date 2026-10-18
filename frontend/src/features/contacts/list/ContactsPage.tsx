import { useState } from "react";
import { Button } from "../../../components/Button";
import { EmptyState, ErrorState, LoadingState } from "../../../components/StateViews";
import { useContactList } from "../../../hooks/resources";
import { useSelection } from "../../../hooks/useSelection";
import { BulkTagBar } from "./BulkTagBar";
import { describeBulkResult } from "./bulkResult";
import { ContactFilters } from "./ContactFilters";
import { ContactTable } from "./ContactTable";
import styles from "./ContactsPage.module.css";
import { type ListState, toApiParams } from "./listParams";
import { Pagination } from "./Pagination";
import { useListQueryState } from "./useListQueryState";

export function ContactsPage() {
  const [state, update] = useListQueryState();

  // The selection belongs to one set of results. Keying the view by the search
  // criteria (not the page) resets it whenever they change, so a bulk action
  // can never hit contacts the user can no longer see in the current filter.
  const params = toApiParams(state);
  const criteriaKey = JSON.stringify([
    params.q,
    params.company,
    params.tags,
    params.sortBy,
    params.sortOrder,
  ]);

  return (
    <section className={styles.page}>
      <h1>Contacts</h1>
      <ContactFilters state={state} onChange={update} />
      <ContactListView
        key={criteriaKey}
        state={state}
        onPageChange={(page) => update({ page })}
        onClearFilters={() => update({ q: "", company: "", tags: [] })}
      />
    </section>
  );
}

interface ViewProps {
  state: ListState;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
}

function ContactListView({ state, onPageChange, onClearFilters }: ViewProps) {
  const list = useContactList(toApiParams(state));
  const selection = useSelection();
  const [notice, setNotice] = useState<string>();

  // While the next page loads, keep showing the previous one (dimmed) instead
  // of flashing a spinner.
  const page = list.data ?? list.previousData;
  const hasFilters = state.q.length >= 2 || state.company !== "" || state.tags.length > 0;

  let body;
  if (!page) {
    body =
      list.status === "error" ? (
        <ErrorState title="Couldn't load contacts" error={list.error} onRetry={list.refetch} />
      ) : (
        <LoadingState label="Loading contacts…" />
      );
  } else if (list.status === "error") {
    body = <ErrorState title="Couldn't load contacts" error={list.error} onRetry={list.refetch} />;
  } else if (page.data.length === 0 && page.pagination.total > 0) {
    // e.g. an old link to page 40 after the results shrank
    body = (
      <EmptyState title={`There is no page ${page.pagination.page}`}>
        <Button onClick={() => onPageChange(page.pagination.totalPages)}>
          Go to the last page ({page.pagination.totalPages})
        </Button>
      </EmptyState>
    );
  } else if (page.data.length === 0) {
    body = hasFilters ? (
      <EmptyState title="No contacts match">
        <p>Try a different search, or clear the filters.</p>
        <Button onClick={onClearFilters}>Clear filters</Button>
      </EmptyState>
    ) : (
      <EmptyState title="No contacts yet" />
    );
  } else {
    body = (
      <>
        <ContactTable
          contacts={page.data}
          selection={selection}
          refreshing={list.status === "loading"}
        />
        <Pagination
          pagination={page.pagination}
          onPageChange={onPageChange}
          disabled={list.status === "loading"}
        />
      </>
    );
  }

  return (
    <>
      {selection.selected.size > 0 && (
        <BulkTagBar
          selectedIds={[...selection.selected]}
          onClear={selection.clear}
          onDone={(result) => {
            setNotice(describeBulkResult(result));
            selection.clear();
            list.refetch(); // show the new tags
          }}
        />
      )}
      <p className={styles.notice} role="status">
        {notice}
      </p>
      {body}
    </>
  );
}
