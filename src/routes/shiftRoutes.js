import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listMyShifts, getShift, updateShift, updateShiftStatus, deleteShift,
  joinShift, leaveShift, markAttendance,
} from "../controllers/shiftController.js";

const router = Router();

router.use(protect);

// "/mine" must come before "/:id"
router.get("/mine", listMyShifts);
router.get("/:id", getShift);
router.patch("/:id", updateShift);
router.patch("/:id/status", updateShiftStatus);
router.delete("/:id", deleteShift);
router.post("/:id/join", joinShift);
router.delete("/:id/join", leaveShift);
router.patch("/:id/attendance", markAttendance);

export default router;