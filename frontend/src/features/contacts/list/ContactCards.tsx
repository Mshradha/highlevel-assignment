import { Link, useLocation } from "react-router";
import type { Contact } from "../../../api/types";
import { TagChip } from "../../../components/TagChip";
import type { Selection } from "../../../hooks/useSelection";
import { contactName, formatDate } from "../../../utils/format";
import styles from "./ContactsPage.module.css";
import { SelectAllCheckbox } from "./SelectAllCheckbox";

interface Props {
  contacts: Contact[];
  selection: Selection;
  refreshing: boolean;
}

/**
 * The contact list for narrow screens: one card per contact instead of a
 * 7-column table that would need sideways scrolling on a phone. Same data,
 * same selection, same links as ContactTable.
 */
export function ContactCards({ contacts, selection, refreshing }: Props) {
  const location = useLocation();

  return (
    <div className={styles.cardsWrap}>
      <div className={styles.cardsToolbar}>
        <SelectAllCheckbox
          pageIds={contacts.map((c) => c.id)}
          selection={selection}
          label="Select all on this page"
        />
      </div>
      <ul
        className={styles.cards}
        aria-label="Contacts"
        aria-busy={refreshing || undefined}
        data-refreshing={refreshing || undefined}
      >
        {contacts.map((contact) => {
          const name = contactName(contact);
          const selected = selection.isSelected(contact.id);
          return (
            <li key={contact.id} className={styles.card} data-selected={selected || undefined}>
              <div className={styles.cardHeader}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => selection.toggle(contact.id)}
                  aria-label={`Select ${name}`}
                />
                <Link
                  to={`/contacts/${contact.id}`}
                  state={{ listSearch: location.search }}
                  className={styles.cardName}
                >
                  {name}
                </Link>
              </div>
              <dl className={styles.cardDetails}>
                {contact.email && (
                  <div>
                    <dt>Email</dt>
                    <dd>{contact.email}</dd>
                  </div>
                )}
                {contact.phone && (
                  <div>
                    <dt>Phone</dt>
                    <dd>{contact.phone}</dd>
                  </div>
                )}
                {contact.company && (
                  <div>
                    <dt>Company</dt>
                    <dd>{contact.company}</dd>
                  </div>
                )}
                <div>
                  <dt>Created</dt>
                  <dd>
                    <time dateTime={contact.createdAt}>{formatDate(contact.createdAt)}</time>
                  </dd>
                </div>
              </dl>
              {contact.tags.length > 0 && (
                <span className={styles.chipRow}>
                  {contact.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
