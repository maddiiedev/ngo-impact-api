import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listMyDonations,
  listReceivedDonations,
  getDonation,
  getReceipt,
  confirmDonation,
  rejectDonation,
  cancelDonation,
} from "../controllers/donationController.js";

const router = Router();

router.use(protect);

// Fixed paths must come before "/:id"
router.get("/mine", listMyDonations);
router.get("/received", listReceivedDonations);

router.get("/:id", getDonation);
router.get("/:id/receipt", getReceipt);
router.patch("/:id/confirm", confirmDonation);
router.patch("/:id/reject", rejectDonation);
router.delete("/:id", cancelDonation);

export default router;