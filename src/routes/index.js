import { Router } from "express";
import { protect } from "../middleware/auth.js";
import campaignRoutes from "./campaignRoutes.js";
import {
  createFundraiser,
  listFundraisers,
  listMyFundraisers,
  getFundraiser,
  updateFundraiser,
  deleteFundraiser,
} from "../controllers/fundraiserController.js";
import campaignRoutes from "./campaignRoutes.js";

const router = Router();

// "/mine" must come before "/:id", or "mine" is treated as an ID
router.get("/mine", protect, listMyFundraisers);

// Public read routes
router.get("/", listFundraisers);
router.get("/:id", getFundraiser);
router.use("/campaigns", campaignRoutes);

// Protected write routes
router.post("/", protect, createFundraiser);
router.patch("/:id", protect, updateFundraiser);
router.delete("/:id", protect, deleteFundraiser);


export default router;