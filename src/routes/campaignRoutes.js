import express from 'express';

import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
} from '../controllers/campaignController.js';

const router = express.Router();

router.route('/')
  .post(createCampaign)
  .get(getCampaigns);

router.route('/:id')
  .get(getCampaignById)
  .patch(updateCampaign)
  .delete(deleteCampaign);

export default router;
