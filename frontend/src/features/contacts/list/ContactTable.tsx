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
  /** True while a newer page is loading: rows are dimmed and marked busy. */
  refreshing: boolean;
}

export function ContactTable({ contacts, selection, refreshing }: Props) {
  const location = useLocation();

  return (
    <div className={styles.tableWrap}>
      <table
        className={styles.table}
        aria-busy={refreshing || undefined}
        data-refreshing={refreshing || undefined}
      >
        <caption className="visually-hidden">Contacts</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.checkCell}>
              <SelectAllCheckbox
                pageIds={contacts.map((c) => c.id)}
                selection={selection}
                ariaLabel="Select all contacts on this page"
              />
            </th>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Company</th>
            <th scope="col">Tags</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => {
            const name = contactName(contact);
            const selected = selection.isSelected(contact.id);
            return (
              <tr key={contact.id} aria-selected={selected}>
                <td className={styles.checkCell}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => selection.toggle(contact.id)}
                    aria-label={`Select ${name}`}
                  />
                </td>
                <td>
                  {/* Remember the list view so "Back to contacts" restores it. */}
                  <Link to={`/contacts/${contact.id}`} state={{ listSearch: location.search }}>
                    {name}
                  </Link>
                </td>
                <td>{contact.email ?? <span className={styles.muted}>—</span>}</td>
                <td>{contact.phone ?? <span className={styles.muted}>—</span>}</td>
                <td>{contact.company ?? <span className={styles.muted}>—</span>}</td>
                <td>
                  <span className={styles.chipRow}>
                    {contact.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </span>
                </td>
                <td>
                  <time dateTime={contact.createdAt}>{formatDate(contact.createdAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
