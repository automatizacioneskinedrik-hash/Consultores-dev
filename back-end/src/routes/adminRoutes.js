import express from "express";
import * as adminController from "../controllers/adminController.js";
import { isAdminOrSuperadminRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(async (req, res, next) => {
  const authorized = await isAdminOrSuperadminRequest(req);
  if (!authorized) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
});

router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.addUser);
router.put("/users/:id", adminController.editUser);
router.delete("/users/:id", adminController.deleteUser);

router.get("/email-config", adminController.getEmailConfig);
router.put("/email-config", adminController.updateEmailConfig);

router.get("/dashboard-stats", adminController.getDashboardStats);

export default router;
