import { Router } from 'express';

import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import ngoRoutes from './ngoRoutes.js';
import fundraiserRoutes from './fundraiserRoutes.js';
import campaignRoutes from './campaignRoutes.js';

const router = Router();

// Authentication
router.use('/auth', authRoutes);

// Dashboard
router.use('/dashboard', dashboardRoutes);

// NGO management
router.use('/ngos', ngoRoutes);

// Fundraisers
router.use('/fundraisers', fundraiserRoutes);

// Campaigns
router.use('/campaigns', campaignRoutes);

export default router;
