import type { Pagination as PaginationInfo } from "../../../api/types";
import { Button } from "../../../components/Button";
import styles from "./ContactsPage.module.css";

interface Props {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ pagination, onPageChange, disabled = false }: Props) {
  const { page, limit, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span aria-live="polite">
        {total === 0 ? "No contacts" : `Showing ${first}–${last} of ${total.toLocaleString()}`}
      </span>
      <span className={styles.pageButtons}>
        <Button onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>
          Previous
        </Button>
        <span>
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages}>
          Next
        </Button>
      </span>
    </nav>
  );
}
