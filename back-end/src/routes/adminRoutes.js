import express from "express";
import * as adminController from "../controllers/adminController.js";
import * as executiveDashboardController from "../controllers/executiveDashboardController.js";
import { getRequester } from "../middleware/auth.js";

const router = express.Router();

// The Panel is open to every cargo; each one sees only what its cargo allows (see the controller).
const signedIn = async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester) return res.status(403).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
};

router.get("/dashboard-consultants", signedIn, executiveDashboardController.getDashboardConsultants);
router.get("/consultant-available-dates", signedIn, executiveDashboardController.getConsultantAvailableDates);
router.get("/executive-dashboard", signedIn, executiveDashboardController.getExecutiveDashboardData);

// Everything else is for the cargos that manage the app.
router.use(async (req, res, next) => {
  const requester = await getRequester(req);
  if (!requester?.cargo.manages) return res.status(403).json({ ok: false, error: "No autorizado" });
  req.requester = requester;
  next();
});

router.get("/cargos", adminController.getCargos);
router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.addUser);
router.put("/users/:id", adminController.editUser);
router.delete("/users/:id", adminController.deleteUser);
router.get("/audit-log", adminController.getAuditLog);

router.get("/email-config", adminController.getEmailConfig);
router.put("/email-config", adminController.updateEmailConfig);

router.get("/dashboard-stats", adminController.getDashboardStats);

export default router;
