import { Link, useLocation, useParams } from "react-router";
import { ApiError } from "../../../api/client";
import type { Contact } from "../../../api/types";
import { ErrorState, LoadingState } from "../../../components/StateViews";
import { useActivities, useContact } from "../../../hooks/resources";
import { contactName, formatDateTime } from "../../../utils/format";
import { ActivityTimeline } from "./ActivityTimeline";
import { ContactEditForm } from "./ContactEditForm";
import styles from "./ContactDetailPage.module.css";
import { TagEditor } from "./TagEditor";

export function ContactDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  // Back to the same list view (search, filters, page) the user came from.
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? "";
  const backLink = (
    <Link to={`/contacts${listSearch}`} className={styles.back}>
      ← Back to contacts
    </Link>
  );

  const contact = useContact(id);
  const activities = useActivities(id);

  if (!contact.data) {
    if (contact.status === "error") {
      const missing =
        contact.error instanceof ApiError &&
        (contact.error.code === "NOT_FOUND" || contact.error.code === "INVALID_ID");
      return (
        <section>
          {backLink}
          <ErrorState
            title={missing ? "Contact not found" : "Couldn't load this contact"}
            error={contact.error}
            onRetry={missing ? undefined : contact.refetch}
          />
        </section>
      );
    }
    return (
      <section>
        {backLink}
        <LoadingState label="Loading contact…" />
      </section>
    );
  }

  const current = contact.data;
  // Saves and tag changes return the updated contact: show it without a
  // refetch, and reload the activity so the new entry appears.
  const showSaved = (next: Contact) => {
    contact.setData(next);
    activities.refetch();
  };

  return (
    <section className={styles.page}>
      {backLink}
      <header className={styles.header}>
        <h1>{contactName(current)}</h1>
        <p className={styles.muted}>
          Created {formatDateTime(current.createdAt)} · Last updated{" "}
          {formatDateTime(current.updatedAt)} · Version {current.version}
        </p>
      </header>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          {/* Keyed by id: opening another contact starts a fresh form. */}
          <ContactEditForm
            key={current.id}
            contact={current}
            onSaved={showSaved}
            onConflict={(latest) => {
              // Show their version, and their edit in the timeline.
              contact.setData(latest);
              activities.refetch();
            }}
          />
          <TagEditor contact={current} onChanged={showSaved} />
        </div>
        <ActivityTimeline request={activities} />
      </div>
    </section>
  );
}
