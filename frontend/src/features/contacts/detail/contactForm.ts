import { z } from "zod";
import type { Contact, EditableContactField, UpdateContactInput } from "../../../api/types";

/**
 * Edit-form state as a pure reducer (form state, separate from server data).
 *
 * Three versions of the contact matter during editing:
 *   - base:   the server version the draft started from (its version is sent with the save)
 *   - draft:  what the user has typed
 *   - theirs: the newer server version, received with a 409 conflict
 * The draft is never discarded by a failed save or a conflict; only the user's
 * explicit "Use their version" replaces it.
 */

export const FORM_FIELDS = ["firstName", "lastName", "email", "phone", "company"] as const;
export type Draft = Record<EditableContactField, string>;

export const FIELD_LABELS: Record<EditableContactField, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  company: "Company",
};

export function draftFromContact(contact: Contact): Draft {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
  };
}

/** Roughly what the server will store, so "did this field change?" matches the server's answer. */
function comparable(field: EditableContactField, value: string | null): string {
  const cleaned = (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  return field === "email" ? cleaned.toLowerCase() : cleaned;
}

const differs = (field: EditableContactField, a: string | null, b: string | null) =>
  comparable(field, a) !== comparable(field, b);

export type FieldErrors = Partial<Record<EditableContactField, string>>;

export interface FormState {
  base: Contact;
  draft: Draft;
  status: "editing" | "saving" | "conflict";
  theirs: Contact | undefined;
  fieldErrors: FieldErrors;
  formError: string | undefined;
}

export type FormAction =
  | { type: "FIELD_CHANGED"; field: EditableContactField; value: string }
  | { type: "VALIDATION_FAILED"; fieldErrors: FieldErrors }
  | { type: "SUBMIT_STARTED" }
  | { type: "SUBMIT_SUCCEEDED"; contact: Contact }
  | { type: "SUBMIT_FAILED"; fieldErrors: FieldErrors; formError: string | undefined }
  | { type: "CONFLICT_RECEIVED"; theirs: Contact }
  | { type: "KEEP_MINE" }
  | { type: "USE_THEIRS" }
  | { type: "DISCARD_CHANGES" };

export function initFormState(contact: Contact): FormState {
  return {
    base: contact,
    draft: draftFromContact(contact),
    status: "editing",
    theirs: undefined,
    fieldErrors: {},
    formError: undefined,
  };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "FIELD_CHANGED": {
      const fieldErrors = { ...state.fieldErrors };
      delete fieldErrors[action.field]; // the user is fixing it
      return { ...state, draft: { ...state.draft, [action.field]: action.value }, fieldErrors };
    }
    case "VALIDATION_FAILED":
      return { ...state, status: "editing", fieldErrors: action.fieldErrors, formError: undefined };
    case "SUBMIT_STARTED":
      return { ...state, status: "saving", formError: undefined };
    case "SUBMIT_SUCCEEDED":
      return initFormState(action.contact);
    case "SUBMIT_FAILED": // the draft stays exactly as typed
      return {
        ...state,
        status: "editing",
        fieldErrors: action.fieldErrors,
        formError: action.formError,
      };
    case "CONFLICT_RECEIVED":
      return { ...state, status: "conflict", theirs: action.theirs, formError: undefined };
    case "KEEP_MINE": {
      // Three-way merge: fields the user edited keep the user's value; every
      // other field takes the newer server value. Rebasing onto `theirs` also
      // takes its version, so the next save is checked against what they saw.
      if (!state.theirs) return state;
      const theirsDraft = draftFromContact(state.theirs);
      const merged = { ...theirsDraft };
      for (const field of FORM_FIELDS) {
        if (differs(field, state.draft[field], draftFromContact(state.base)[field])) {
          merged[field] = state.draft[field];
        }
      }
      return { ...state, base: state.theirs, draft: merged, status: "editing", theirs: undefined };
    }
    case "USE_THEIRS":
    case "DISCARD_CHANGES": {
      const contact = action.type === "USE_THEIRS" && state.theirs ? state.theirs : state.base;
      return initFormState(contact);
    }
  }
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/** Fields whose draft value differs from the base. */
export function changedFields(state: Pick<FormState, "base" | "draft">): EditableContactField[] {
  const base = draftFromContact(state.base);
  return FORM_FIELDS.filter((field) => differs(field, state.draft[field], base[field]));
}

/** The PATCH body: the base version plus only the changed fields ("" clears a field). */
export function toUpdateInput(state: Pick<FormState, "base" | "draft">): UpdateContactInput {
  const input: UpdateContactInput = { version: state.base.version };
  for (const field of changedFields(state)) {
    const value = state.draft[field].trim();
    if (field === "firstName") input.firstName = value;
    else input[field] = value === "" ? null : value;
  }
  return input;
}

export interface ConflictField {
  field: EditableContactField;
  yours: string;
  theirs: string;
  /** Both sides changed this field to different values. */
  clash: boolean;
}

/** What the other person changed, and where it collides with the user's edits. */
export function conflictFields(state: FormState): ConflictField[] {
  if (!state.theirs) return [];
  const base = draftFromContact(state.base);
  const theirs = draftFromContact(state.theirs);
  return FORM_FIELDS.filter((field) => differs(field, theirs[field], base[field])).map((field) => {
    const youChanged = differs(field, state.draft[field], base[field]);
    return {
      field,
      yours: state.draft[field],
      theirs: theirs[field],
      clash: youChanged && differs(field, state.draft[field], theirs[field]),
    };
  });
}

// ---------------------------------------------------------------------------
// Client-side validation (same rules as the backend, for instant feedback;
// the server still validates everything)
// ---------------------------------------------------------------------------

/** "" means "no value" for optional fields; anything else must pass `schema`. */
const optional = (schema: z.ZodType<string>) => z.union([z.literal(""), schema]);

const draftSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100, "At most 100 characters"),
  lastName: z.string().trim().max(100, "At most 100 characters"),
  email: optional(
    z
      .string()
      .trim()
      .max(254, "At most 254 characters")
      .pipe(z.email("Enter a valid email address")),
  ),
  phone: optional(
    z
      .string()
      .trim()
      .max(30, "At most 30 characters")
      .refine((v) => /^\d{7,15}$/.test(v.replace(/\D/g, "")), "Phone must contain 7–15 digits"),
  ),
  company: z.string().trim().max(200, "At most 200 characters"),
});

export function validateDraft(draft: Draft): FieldErrors {
  const trimmed = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])) as Draft;
  const result = draftSchema.safeParse(trimmed);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as EditableContactField;
    errors[field] ??= issue.message;
  }
  return errors;
}
