import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';

// Create a campaign
export const createCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.create(req.body);

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: campaign,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create campaign',
    });
  }
};

// Get all campaigns, with optional filters and search
export const getCampaigns = async (req, res) => {
  try {
    const { status, category, ngo, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (ngo) {
      if (!mongoose.Types.ObjectId.isValid(ngo)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid NGO ID',
        });
      }

      filter.ngo = ngo;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    const campaigns = await Campaign.find(filter).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve campaigns',
    });
  }
};

// Get one campaign by ID
export const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve campaign',
    });
  }
};

// Update a campaign
export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const allowedFields = [
      'title',
      'description',
      'category',
      'coverImageUrl',
      'goalAmount',
      'currency',
      'startDate',
      'endDate',
      'status',
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid campaign fields provided for update',
      });
    }

    const campaign = await Campaign.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update campaign',
    });
  }
};

// Delete a campaign
export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    const campaign = await Campaign.findByIdAndDelete(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete campaign',
    });
  }
};
