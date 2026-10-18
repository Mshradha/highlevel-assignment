import { useEffect, useRef } from "react";
import { Button } from "../../../components/Button";
import { type ConflictField, FIELD_LABELS } from "./contactForm";
import styles from "./ContactDetailPage.module.css";

interface Props {
  fields: ConflictField[];
  onKeepMine: () => void;
  onUseTheirs: () => void;
}

const show = (value: string) => value || "(empty)";

/**
 * Shown after a 409: someone saved this contact after the user opened it.
 * Nothing is lost or applied silently; the user chooses.
 */
export function ConflictBanner({ fields, onKeepMine, onUseTheirs }: Props) {
  // The form is read-only until the user decides, so put keyboard focus on the
  // decision instead of leaving it on a field or the unavailable Save button.
  const keepMineRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepMineRef.current?.focus();
  }, []);

  return (
    <div className={styles.conflict} role="alert">
      <p className={styles.conflictTitle}>
        Someone else changed this contact while you were editing.
      </p>
      {fields.length > 0 ? (
        <div className={styles.tableScroll}>
          <table className={styles.conflictTable}>
            <caption className="visually-hidden">Changes made by someone else</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Their value</th>
                <th scope="col">Your value</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(({ field, theirs, yours, clash }) => (
                <tr key={field}>
                  <th scope="row">{FIELD_LABELS[field]}</th>
                  <td>{show(theirs)}</td>
                  <td>
                    {show(yours)}
                    {clash && <strong className={styles.clash}> — you both changed this</strong>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Their changes don't affect the fields shown here.</p>
      )}
      <p>
        <strong>Keep my changes</strong> applies your edits on top of their version, then lets you
        review and save. <strong>Use their version</strong> discards your edits.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={onKeepMine} ref={keepMineRef}>
          Keep my changes
        </Button>
        <Button onClick={onUseTheirs}>Use their version</Button>
      </div>
    </div>
  );
}
