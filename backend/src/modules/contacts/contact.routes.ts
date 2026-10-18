import { Router } from "express";
import { contactController } from "./contact.controller.js";

/** Endpoint definitions only: method + path → controller. Mounted at /api/contacts. */
export const contactRouter = Router();

contactRouter.get("/", contactController.list);
contactRouter.get("/:id", contactController.getById);
contactRouter.patch("/:id", contactController.update);
