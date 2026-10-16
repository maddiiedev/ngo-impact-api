// src/routes/ngoRoutes.js
import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { ngoRole } from "../middleware/ngoRole.js";
import {
  createNgo,
  listNgos,
  getNgo,
  updateNgo,
  addMember,
  updateMemberRole,
  removeMember,
  transferOwnership,
} from "../controllers/ngoController.js";
import { createCampaign, listNgoCampaigns } from "../controllers/campaignController.js";
import { createOpportunity, listNgoOpportunities } from "../controllers/opportunityController.js";

const router = Router();

router.use(protect);

router.get("/", listNgos);
router.post("/", createNgo);
router.get("/:id", getNgo);
router.patch("/:id", ngoRole("owner", "admin"), updateNgo);

router.post("/:id/members", ngoRole("owner", "admin"), addMember);
router.patch("/:id/members/:userId", ngoRole("owner"), updateMemberRole);
router.delete("/:id/members/:userId", ngoRole(), removeMember);
router.post("/:id/transfer-ownership", ngoRole("owner"), transferOwnership);

router.get("/:id/campaigns", listNgoCampaigns);
router.post("/:ngoId/campaigns", ngoRole("owner", "admin"), createCampaign);

router.get("/:id/opportunities", listNgoOpportunities);
router.post("/:ngoId/opportunities", ngoRole("owner", "admin"), createOpportunity);

export default router;