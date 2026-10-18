import { type FormEvent, useEffect, useReducer, useState } from "react";
import { ApiError } from "../../../api/client";
import { updateContact } from "../../../api/contacts";
import type { Contact } from "../../../api/types";
import { Button } from "../../../components/Button";
import { TextField } from "../../../components/TextField";
import { describeError } from "../../../utils/errors";
import { ConflictBanner } from "./ConflictBanner";
import {
  changedFields,
  conflictFields,
  FIELD_LABELS,
  FORM_FIELDS,
  type FieldErrors,
  formReducer,
  initFormState,
  toUpdateInput,
  validateDraft,
} from "./contactForm";
import styles from "./ContactDetailPage.module.css";

interface Props {
  contact: Contact;
  /** A save succeeded: the parent shows the new contact and refreshes the activity. */
  onSaved: (contact: Contact) => void;
  /** A save hit a conflict: the parent shows the server's current contact. */
  onConflict: (current: Contact) => void;
}

const INPUT_TYPES = {
  firstName: "text",
  lastName: "text",
  email: "email",
  phone: "tel",
  company: "text",
} as const;
const AUTOCOMPLETE = {
  firstName: "off",
  lastName: "off",
  email: "off",
  phone: "off",
  company: "off",
} as const;

export function ContactEditForm({ contact, onSaved, onConflict }: Props) {
  const [state, dispatch] = useReducer(formReducer, contact, initFormState);
  const [rebased, setRebased] = useState(false);
  const dirtyFields = changedFields(state);
  const isDirty = dirtyFields.length > 0;
  const saving = state.status === "saving";

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || state.status === "conflict" || !isDirty) return; // no double submits

    const fieldErrors = validateDraft(state.draft);
    if (Object.keys(fieldErrors).length > 0) {
      dispatch({ type: "VALIDATION_FAILED", fieldErrors });
      return;
    }

    dispatch({ type: "SUBMIT_STARTED" });
    setRebased(false);
    try {
      const saved = await updateContact(contact.id, toUpdateInput(state));
      dispatch({ type: "SUBMIT_SUCCEEDED", contact: saved });
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        const current = error.conflictCurrent();
        if (current) {
          dispatch({ type: "CONFLICT_RECEIVED", theirs: current });
          onConflict(current);
          return;
        }
      }
      // Validation and duplicate-email errors go next to their fields; anything
      // else is shown above the form. In every case the draft is kept.
      const fieldErrors: FieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      dispatch({
        type: "SUBMIT_FAILED",
        fieldErrors,
        formError: Object.keys(fieldErrors).length > 0 ? undefined : describeError(error),
      });
    }
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-labelledby="edit-heading">
      <h2 id="edit-heading">Details</h2>

      {state.status === "conflict" && (
        <ConflictBanner
          fields={conflictFields(state)}
          onKeepMine={() => {
            dispatch({ type: "KEEP_MINE" });
            setRebased(true);
          }}
          onUseTheirs={() => dispatch({ type: "USE_THEIRS" })}
        />
      )}
      {rebased && state.status === "editing" && (
        <p className={styles.info} role="status">
          Your edits are now on top of the latest version. Review them and save.
        </p>
      )}
      {state.formError && (
        <p className={styles.formError} role="alert">
          {state.formError}
        </p>
      )}

      {/* Inputs become read-only (not disabled) while saving or resolving a conflict:
          a disabled input loses keyboard focus. */}
      <fieldset className={styles.fields}>
        <legend className="visually-hidden">Contact details</legend>
        {FORM_FIELDS.map((field) => (
          <TextField
            key={field}
            label={FIELD_LABELS[field]}
            type={INPUT_TYPES[field]}
            autoComplete={AUTOCOMPLETE[field]}
            value={state.draft[field]}
            onChange={(e) => dispatch({ type: "FIELD_CHANGED", field, value: e.target.value })}
            error={state.fieldErrors[field]}
            required={field === "firstName"}
            readOnly={saving || state.status === "conflict"}
            hint={field === "firstName" ? "Required" : undefined}
          />
        ))}
      </fieldset>

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          busy={saving}
          busyLabel="Saving…"
          disabled={!isDirty || state.status === "conflict"}
        >
          Save changes
        </Button>
        <Button
          onClick={() => {
            dispatch({ type: "DISCARD_CHANGES" });
            setRebased(false);
          }}
          disabled={!isDirty || saving || state.status === "conflict"}
        >
          Discard
        </Button>
        <span className={styles.muted} aria-live="polite">
          {isDirty ? `Unsaved changes: ${dirtyFields.map((f) => FIELD_LABELS[f]).join(", ")}` : ""}
        </span>
      </div>
    </form>
  );
}
