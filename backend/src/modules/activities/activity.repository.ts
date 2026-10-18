import type { ClientSession, Types } from "mongoose";
import type { EditableContactField } from "../contacts/contact.constants.js";
import { ActivityModel, type ActivityType } from "./activity.model.js";

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
};
