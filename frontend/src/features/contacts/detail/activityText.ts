import type { Activity } from "../../../api/types";
import { FIELD_LABELS } from "./contactForm";

const shown = (value: string | null) => (value ? `“${value}”` : "empty");

export function describeActivity(activity: Activity): { title: string; lines: string[] } {
  const { tag, changes, bulkOperationId } = activity.details;
  switch (activity.type) {
    case "TAG_ADDED":
      return { title: `Added tag “${tag}”${bulkOperationId ? " (bulk)" : ""}`, lines: [] };
    case "TAG_REMOVED":
      return { title: `Removed tag “${tag}”`, lines: [] };
    case "CONTACT_UPDATED":
      return {
        title: "Updated details",
        lines: (changes ?? []).map(
          (c) => `${FIELD_LABELS[c.field]}: ${shown(c.from)} → ${shown(c.to)}`,
        ),
      };
  }
}
