import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { ngoRole } from '../middleware/ngoRole.js';
import { createCampaign, listNgoCampaigns } from "../controllers/campaignController.js";
import { createCampaign, listNgoCampaigns } from "../controllers/campaignController.js";

import {
  createNgo, listNgos, getNgo, updateNgo,
  addMember, updateMemberRole, removeMember,
} from '../controllers/ngoController.js';

const router = Router();

router.use(protect);

router.get('/', listNgos);
router.post('/', createNgo);
router.get('/:id', getNgo);
router.patch('/:id', ngoRole('owner', 'admin'), updateNgo);
router.get("/:id/campaigns", listNgoCampaigns);
router.post("/:ngoId/campaigns", ngoRole("owner", "admin"), createCampaign);
router.post('/:id/members', ngoRole('owner', 'admin'), addMember);
router.patch('/:id/members/:userId', ngoRole('owner'), updateMemberRole);
router.delete('/:id/members/:userId', ngoRole(), removeMember);

router.get("/:id/campaigns", listNgoCampaigns);
router.post("/:ngoId/campaigns", ngoRole("owner", "admin"), createCampaign);

export default router;