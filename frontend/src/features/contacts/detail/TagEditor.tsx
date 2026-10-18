import { type FormEvent, useId, useRef, useState } from "react";
import { addTag, removeTag } from "../../../api/contacts";
import type { Contact, TagChangeResult } from "../../../api/types";
import { Button } from "../../../components/Button";
import { TagChip } from "../../../components/TagChip";
import ui from "../../../components/ui.module.css";
import { describeError } from "../../../utils/errors";
import { normalizeTagInput, TAG_PATTERN } from "../list/listParams";
import styles from "./ContactDetailPage.module.css";

interface Props {
  contact: Contact;
  /** A tag change was saved: the parent shows the returned contact and refreshes the activity. */
  onChanged: (contact: Contact) => void;
}

export function TagEditor({ contact, onChanged }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string>(); // the tag being added or removed
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string }>();

  async function run(tag: string, action: () => Promise<TagChangeResult>, noop: string) {
    if (pending) return; // one tag operation at a time
    setPending(tag);
    setMessage(undefined);
    try {
      const result = await action();
      onChanged(result.contact);
      if (!result.changed) setMessage({ kind: "info", text: noop });
      return true;
    } catch (error) {
      setMessage({ kind: "error", text: describeError(error) });
      return false;
    } finally {
      setPending(undefined);
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const tag = normalizeTagInput(text);
    if (!TAG_PATTERN.test(tag)) {
      setMessage({
        kind: "error",
        text: "Tags use letters, digits, spaces, - and _ (up to 40 characters)",
      });
      return;
    }
    const ok = await run(
      tag,
      () => addTag(contact.id, tag),
      `“${tag}” is already on this contact.`,
    );
    if (ok) setText("");
  };

  return (
    <section className={styles.card} aria-labelledby="tags-heading">
      <h2 id="tags-heading">Tags</h2>
      {contact.tags.length > 0 ? (
        <ul className={styles.chipList} aria-label="Tags on this contact">
          {contact.tags.map((tag) => (
            <li key={tag}>
              <TagChip
                tag={tag}
                removing={pending === tag}
                onRemove={async () => {
                  const ok = await run(
                    tag,
                    () => removeTag(contact.id, tag),
                    `“${tag}” was already removed.`,
                  );
                  // The chip (and its focused button) is gone: keep keyboard users in the section.
                  if (ok) inputRef.current?.focus();
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No tags yet.</p>
      )}

      <form className={styles.inlineForm} onSubmit={submit}>
        <label htmlFor={inputId} className="visually-hidden">
          New tag
        </label>
        <input
          id={inputId}
          className={ui.input}
          placeholder="Add a tag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40}
          readOnly={pending !== undefined}
          ref={inputRef}
        />
        <Button
          type="submit"
          busy={pending !== undefined && pending === normalizeTagInput(text)}
          busyLabel="Adding…"
        >
          Add tag
        </Button>
      </form>
      {message && (
        <p
          className={message.kind === "error" ? styles.formError : styles.info}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
