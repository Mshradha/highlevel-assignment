import { Router } from "express";
import { activityController } from "../activities/activity.controller.js";
import { contactController } from "./contact.controller.js";
import { tagController } from "./tag.controller.js";

/** Endpoint definitions only: method + path → controller. Mounted at /api/contacts. */
export const contactRouter = Router();

contactRouter.get("/", contactController.list);
// Registered before "/:id" routes so "bulk-tags" is never read as an :id.
contactRouter.post("/bulk-tags", tagController.bulkAdd);

contactRouter.get("/:id", contactController.getById);
contactRouter.patch("/:id", contactController.update);

contactRouter.post("/:id/tags", tagController.add);
contactRouter.delete("/:id/tags/:tag", tagController.remove);

contactRouter.get("/:id/activities", activityController.listForContact);
