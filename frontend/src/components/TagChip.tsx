import styles from "./ui.module.css";

interface TagChipProps {
  tag: string;
  /** When given, the chip shows a remove button with an accessible name. */
  onRemove?: () => void;
  removing?: boolean;
}

export function TagChip({ tag, onRemove, removing = false }: TagChipProps) {
  return (
    <span className={styles.chip}>
      {tag}
      {onRemove && (
        <button
          type="button"
          className={styles.chipRemove}
          onClick={() => {
            if (!removing) onRemove();
          }}
          aria-disabled={removing || undefined}
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
