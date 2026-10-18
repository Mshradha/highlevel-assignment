import type { ClientSession, Types } from "mongoose";
import type { EditableContactField } from "../contacts/contact.constants.js";
import { type ActivityRecord, ActivityModel, type ActivityType } from "./activity.model.js";

export type ActivityLean = ActivityRecord & { _id: Types.ObjectId };

export interface FieldChange {
  field: EditableContactField;
  from: string | null;
  to: string | null;
}

export interface NewActivity {
  contactId: Types.ObjectId;
  type: ActivityType;
  details: { changes?: FieldChange[]; tag?: string; bulkOperationId?: string };
}

export const activityRepository = {
  /** Always called inside the transaction that made the change it records. */
  async insert(activity: NewActivity, session: ClientSession): Promise<void> {
    await ActivityModel.create([activity], { session });
  },

  async insertMany(activities: NewActivity[], session: ClientSession): Promise<void> {
    if (activities.length > 0) await ActivityModel.insertMany(activities, { session });
  },

  /** Newest first; _id breaks ties between activities created in the same millisecond. */
  listForContact(contactId: string, limit: number): Promise<ActivityLean[]> {
    return ActivityModel.find({ contactId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<ActivityLean[]>()
      .exec();
  },
};
