// src/controllers/campaignController.js
import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import NGO from "../models/NGO.js";
import Donation from "../models/Donation.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  isText,
  escapeRegex,
  validateGoal,
  parseCurrency,
  parseImageUrl,
  parseDate,
} from "../utils/validators.js";

const STATUSES = ["draft", "active", "completed", "cancelled"];
const CREATE_STATUSES = ["draft", "active"];
const FINISHED = ["completed", "cancelled"];

// Allowed status changes. Completed and cancelled are final.
const TRANSITIONS = {
  draft: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const parsePaging = (query, defaultLimit = 10) => ({
  page: Math.max(parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 50),
});

// Loads a campaign, only if the user is owner/admin of its NGO (and the NGO isn't suspended)
const getManageableCampaign = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid campaign ID", 400);

  const campaign = await Campaign.findById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);

  const isManager = await NGO.exists({
    _id: campaign.ngo,
    status: { $ne: "suspended" },
    members: { $elemMatch: { user: userId, role: { $in: ["owner", "admin"] } } },
  });
  if (!isManager) throw new AppError("You do not have permission to manage this campaign", 403);

  return campaign;
};

// POST /ngos/:ngoId/campaigns   (ngoRole("owner", "admin") runs first and sets req.ngo)
export const createCampaign = asyncHandler(async (req, res) => {
  const { title, description, goalAmount } = req.body;

  if (!isText(title) || !isText(description)) {
    throw new AppError("title and description are required", 400);
  }

  const data = {
    ngo: req.ngo._id,
    createdBy: req.user._id,
    title: title.trim(),
    description: description.trim(),
    goalAmount: validateGoal(goalAmount),
  };

  if (req.body.category !== undefined) {
    if (typeof req.body.category !== "string") throw new AppError("category must be a string", 400);
    data.category = req.body.category.trim();
  }
  if (req.body.coverImageUrl !== undefined) data.coverImageUrl = parseImageUrl(req.body.coverImageUrl);
  if (req.body.currency !== undefined) data.currency = parseCurrency(req.body.currency);

  const startDate = req.body.startDate !== undefined ? parseDate(req.body.startDate, "startDate") : null;
  const endDate = req.body.endDate !== undefined ? parseDate(req.body.endDate, "endDate") : null;

  if (startDate) data.startDate = startDate;
  if (endDate) {
    if (endDate <= new Date()) throw new AppError("endDate must be in the future", 400);
    if (endDate <= (startDate || new Date())) throw new AppError("endDate must be after startDate", 400);
    data.endDate = endDate;
  }

  if (req.body.status !== undefined) {
    if (!CREATE_STATUSES.includes(req.body.status)) {
      throw new AppError("A new campaign must be 'draft' or 'active'", 400);
    }
    data.status = req.body.status;
  }

  const campaign = await Campaign.create(data);

  res.status(201).json({ success: true, data: { campaign } });
});

// GET /campaigns   (public)
export const listCampaigns = asyncHandler(async (req, res) => {
  const { search, category, status, ngo } = req.query;
  const { page, limit } = parsePaging(req.query);

  const filter = {};

  if (isText(search)) filter.$text = { $search: search.trim() };
  if (isText(category)) filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, "i");

  if (isText(status)) {
    // Drafts are private. Managers see them through GET /ngos/:id/campaigns
    if (!STATUSES.includes(status) || status === "draft") {
      throw new AppError("Invalid campaign status", 400);
    }
    filter.status = status;
  } else {
    filter.status = { $ne: "draft" };
  }

  // Hide campaigns that belong to suspended NGOs
  const suspendedIds = await NGO.find({ status: "suspended" }).distinct("_id");

  if (isText(ngo)) {
    if (!mongoose.isValidObjectId(ngo)) throw new AppError("Invalid NGO ID", 400);
    if (suspendedIds.some((id) => String(id) === ngo.trim())) throw new AppError("NGO not found", 404);
    filter.ngo = ngo.trim();
  } else {
    filter.ngo = { $nin: suspendedIds };
  }

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .populate("ngo", "name logoUrl")
      .select("-__v")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Campaign.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { campaigns, page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /campaigns/:id   (public)
export const getCampaign = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Invalid campaign ID", 400);

  const campaign = await Campaign.findById(req.params.id)
    .populate("ngo", "name logoUrl status")
    .populate("createdBy", "fullName")
    .lean();

  if (!campaign || campaign.status === "draft" || !campaign.ngo || campaign.ngo.status === "suspended") {
    throw new AppError("Campaign not found", 404);
  }

  res.json({ success: true, data: { campaign } });
});

// GET /ngos/:id/campaigns   (logged in; owner/admin also see drafts)
export const listNgoCampaigns = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Invalid NGO ID", 400);

  const ngo = await NGO.findById(req.params.id).lean();
  if (!ngo) throw new AppError("NGO not found", 404);

  const membership = ngo.members.find((m) => String(m.user) === String(req.user._id));
  if (ngo.status === "suspended" && !membership) throw new AppError("NGO not found", 404);

  const isManager = membership && ["owner", "admin"].includes(membership.role);
  const { page, limit } = parsePaging(req.query);

  const filter = { ngo: ngo._id };
  if (!isManager) filter.status = { $ne: "draft" };

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .select("-__v")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Campaign.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { campaigns, page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH /campaigns/:id   (owner/admin of the campaign's NGO)
export const updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await getManageableCampaign(req.params.id, req.user._id);

  if (FINISHED.includes(campaign.status)) {
    throw new AppError(`A ${campaign.status} campaign can't be edited`, 409);
  }

  const { body } = req;

  for (const field of ["title", "description"]) {
    if (body[field] === undefined) continue;
    if (!isText(body[field])) throw new AppError(`${field} must be a non-empty string`, 400);
    campaign[field] = body[field].trim();
  }

  if (body.category !== undefined) {
    if (typeof body.category !== "string") throw new AppError("category must be a string", 400);
    campaign.category = body.category.trim();
  }

  if (body.coverImageUrl !== undefined) campaign.coverImageUrl = parseImageUrl(body.coverImageUrl);

  if (body.goalAmount !== undefined) {
    const amount = validateGoal(body.goalAmount);
    if (amount < campaign.raisedAmount) {
      throw new AppError("goalAmount cannot be lower than the amount already raised", 400);
    }
    campaign.goalAmount = amount;
  }

  if (body.currency !== undefined) {
    const currency = parseCurrency(body.currency);
    if (currency !== campaign.currency && campaign.raisedAmount > 0) {
      throw new AppError("currency can't be changed after money has been raised", 400);
    }
    campaign.currency = currency;
  }

  if (body.startDate !== undefined) {
    const startDate = parseDate(body.startDate, "startDate");
    if (!startDate) throw new AppError("startDate can't be empty", 400);
    campaign.startDate = startDate;
  }

  if (body.endDate !== undefined) {
    const endDate = parseDate(body.endDate, "endDate"); // null clears it
    if (endDate && endDate <= new Date()) throw new AppError("endDate must be in the future", 400);
    campaign.endDate = endDate;
  }

  if (campaign.endDate && campaign.endDate <= campaign.startDate) {
    throw new AppError("endDate must be after startDate", 400);
  }

  // ngo, createdBy, raisedAmount and status can't be changed here
  await campaign.save();

  res.json({ success: true, data: { campaign } });
});

// PATCH /campaigns/:id/status   (owner/admin of the campaign's NGO)
export const updateCampaignStatus = asyncHandler(async (req, res) => {
  const campaign = await getManageableCampaign(req.params.id, req.user._id);
  const { status } = req.body;

  if (!STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${STATUSES.join(", ")}`, 400);
  }
  if (!TRANSITIONS[campaign.status].includes(status)) {
    throw new AppError(`Can't change a ${campaign.status} campaign to ${status}`, 409);
  }
  if (status === "active" && campaign.endDate && campaign.endDate <= new Date()) {
    throw new AppError("The campaign's endDate has passed. Update it before activating.", 400);
  }

  campaign.status = status;
  await campaign.save();

  res.json({ success: true, data: { campaign } });
});

// DELETE /campaigns/:id   (owner/admin of the campaign's NGO)
export const deleteCampaign = asyncHandler(async (req, res) => {
  const campaign = await getManageableCampaign(req.params.id, req.user._id);

  // Donations are a record of money given, so they must not be orphaned
  if (await Donation.exists({ campaign: campaign._id })) {
    throw new AppError("This campaign has donations and can't be deleted. Cancel it instead.", 409);
  }

  await campaign.deleteOne();

  res.json({ success: true, message: "Campaign deleted successfully" });
});
