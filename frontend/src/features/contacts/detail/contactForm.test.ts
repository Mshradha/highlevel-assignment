import { describe, expect, it } from "vitest";
import type { Contact } from "../../../api/types";
import {
  changedFields,
  conflictFields,
  type FormAction,
  type FormState,
  formReducer,
  initFormState,
  toUpdateInput,
  validateDraft,
} from "./contactForm";

const v1: Contact = {
  id: "c1",
  firstName: "Ann",
  lastName: "Lee",
  email: "ann@example.com",
  phone: "(555) 123-4567",
  company: "Acme",
  tags: ["vip"],
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const run = (state: FormState, ...actions: FormAction[]) => actions.reduce(formReducer, state);
const edit = (field: keyof FormState["draft"], value: string): FormAction => ({
  type: "FIELD_CHANGED",
  field,
  value,
});

describe("changed fields and the PATCH body", () => {
  it("starts clean", () => {
    expect(changedFields(initFormState(v1))).toEqual([]);
  });

  it("sends the base version plus only the changed fields; clearing becomes null", () => {
    const state = run(initFormState(v1), edit("company", "Globex"), edit("lastName", ""));
    expect(toUpdateInput(state)).toEqual({ version: 1, lastName: null, company: "Globex" });
  });

  it("ignores edits that the server would treat as no change (case, spaces)", () => {
    const state = run(
      initFormState(v1),
      edit("email", "  ANN@Example.com "),
      edit("company", "Acme "),
    );
    expect(changedFields(state)).toEqual([]);
  });
});

describe("saving", () => {
  it("keeps the draft and shows field errors when the save fails", () => {
    const state = run(
      initFormState(v1),
      edit("email", "taken@example.com"),
      { type: "SUBMIT_STARTED" },
      { type: "SUBMIT_FAILED", fieldErrors: { email: "Already used" }, formError: undefined },
    );
    expect(state.status).toBe("editing");
    expect(state.draft.email).toBe("taken@example.com"); // not discarded
    expect(state.fieldErrors).toEqual({ email: "Already used" });
  });

  it("clears a field's error as soon as the user edits that field", () => {
    const state = run(
      initFormState(v1),
      { type: "VALIDATION_FAILED", fieldErrors: { email: "Invalid", phone: "Invalid" } },
      edit("email", "ann@example.org"),
    );
    expect(state.fieldErrors).toEqual({ phone: "Invalid" });
  });

  it("rebases onto the saved contact after a successful save", () => {
    const saved = { ...v1, company: "Globex", version: 2 };
    const state = run(initFormState(v1), edit("company", "Globex"), {
      type: "SUBMIT_SUCCEEDED",
      contact: saved,
    });
    expect(state.base.version).toBe(2);
    expect(changedFields(state)).toEqual([]);
  });
});

describe("conflicts (three-way: base, yours, theirs)", () => {
  // Someone else changed the company and the last name while we edited.
  const theirs: Contact = { ...v1, company: "Globex", lastName: "Kim", version: 2 };

  it("keeps the draft when a conflict arrives and describes what they changed", () => {
    const state = run(
      initFormState(v1),
      edit("phone", "555-000-0000"), // only we changed this
      edit("lastName", "Park"), // both changed this, differently
      { type: "CONFLICT_RECEIVED", theirs },
    );

    expect(state.status).toBe("conflict");
    expect(state.draft).toMatchObject({ phone: "555-000-0000", lastName: "Park" });
    expect(conflictFields(state)).toEqual([
      { field: "lastName", yours: "Park", theirs: "Kim", clash: true },
      { field: "company", yours: "Acme", theirs: "Globex", clash: false },
    ]);
  });

  it("'Keep my changes' keeps my edits, takes their other changes, and adopts their version", () => {
    const state = run(
      initFormState(v1),
      edit("phone", "555-000-0000"),
      edit("lastName", "Park"),
      { type: "CONFLICT_RECEIVED", theirs },
      { type: "KEEP_MINE" },
    );

    // Their company change is kept — a naive "keep my draft" would send "Acme" and undo it.
    expect(state.draft).toMatchObject({
      phone: "555-000-0000",
      lastName: "Park",
      company: "Globex",
    });
    expect(toUpdateInput(state)).toEqual({ version: 2, lastName: "Park", phone: "555-000-0000" });
    expect(state.status).toBe("editing");
  });

  it("'Use their version' replaces the draft with theirs", () => {
    const state = run(
      initFormState(v1),
      edit("phone", "555-000-0000"),
      { type: "CONFLICT_RECEIVED", theirs },
      { type: "USE_THEIRS" },
    );
    expect(state.base).toEqual(theirs);
    expect(changedFields(state)).toEqual([]);
  });
});

describe("validateDraft", () => {
  const valid = initFormState(v1).draft;

  it("accepts a valid draft, including empty optional fields", () => {
    expect(validateDraft(valid)).toEqual({});
    expect(validateDraft({ ...valid, lastName: "", email: "", phone: "", company: "" })).toEqual(
      {},
    );
  });

  it.each([
    [{ firstName: "   " }, "firstName", "First name is required"],
    [{ email: "not-an-email" }, "email", "Enter a valid email address"],
    [{ phone: "12-34" }, "phone", "Phone must contain 7–15 digits"],
    [{ company: "x".repeat(201) }, "company", "At most 200 characters"],
  ])("reports %j", (change, field, message) => {
    expect(validateDraft({ ...valid, ...change })).toEqual({ [field]: message });
  });
});
