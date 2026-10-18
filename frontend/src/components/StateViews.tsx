import type { ReactNode } from "react";
import { describeError } from "../utils/errors";
import { Button } from "./Button";
import styles from "./ui.module.css";

/** role="status" so screen readers announce it without moving focus. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.state} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** role="alert" so the failure is announced immediately. */
export function ErrorState({
  error,
  title = "Couldn't load this",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.state} role="alert">
      <p className={`${styles.stateTitle} ${styles.error}`}>{title}</p>
      <p>{describeError(error)}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <p className={styles.stateTitle}>{title}</p>
      {children}
    </div>
  );
}
