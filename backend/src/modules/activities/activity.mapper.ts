import type { ActivityType } from "./activity.model.js";
import type { ActivityLean, FieldChange } from "./activity.repository.js";

export interface ActivityDTO {
  id: string;
  contactId: string;
  type: ActivityType;
  createdAt: string;
  details: {
    changes?: FieldChange[];
    tag?: string;
    bulkOperationId?: string;
  };
}

export function toActivityDTO(activity: ActivityLean): ActivityDTO {
  const { changes, tag, bulkOperationId } = activity.details ?? {};
  return {
    id: activity._id.toHexString(),
    contactId: activity.contactId.toHexString(),
    type: activity.type,
    createdAt: activity.createdAt.toISOString(),
    details: {
      ...(changes && {
        changes: changes.map(({ field, from, to }) => ({
          field: field as FieldChange["field"],
          from: from ?? null,
          to: to ?? null,
        })),
      }),
      ...(tag && { tag }),
      ...(bulkOperationId && { bulkOperationId }),
    },
  };
}
