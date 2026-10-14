// src/controllers/fundraiserController.js
import mongoose from "mongoose";
import Fundraiser from "../models/Fundraiser.js";
import NGO from "../models/NGO.js";
import Donation from "../models/Donation.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";

const isText = (value) => typeof value === "string" && value.trim().length > 0;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EDITABLE_FIELDS = [
  "title",
  "story",
  "category",
  "coverImageUrl",
  "goalAmount",
  "currency",
  "deadline",
  "status",
];

const ALLOWED_STATUSES = ["draft", "active", "completed", "closed"];
const CREATE_STATUSES = ["draft", "active"];
const ALLOWED_CURRENCIES = ["NGN", "USD"];

const parseDeadline = (value) => {
  if (value === null || value === "") return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("deadline must be a valid date", 400);
  }

  if (date <= new Date()) {
    throw new AppError("deadline must be in the future", 400);
  }

  return date;
};

const validateGoal = (value) => {
  const amount =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 1) {
    throw new AppError(
      "goalAmount must be a number greater than or equal to 1",
      400,
    );
  }

  return amount;
};

const parseCurrency = (value) => {
  if (typeof value !== "string") {
    throw new AppError("currency must be a string", 400);
  }

  const currency = value.trim().toUpperCase();

  if (!ALLOWED_CURRENCIES.includes(currency)) {
    throw new AppError(
      `currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`,
      400,
    );
  }

  return currency;
};

const parseImageUrl = (value) => {
  if (typeof value !== "string") {
    throw new AppError("coverImageUrl must be a string", 400);
  }

  const url = value.trim();
  if (url === "") return ""; // allows clearing the image

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("coverImageUrl must be a valid URL", 400);
  }

  if (parsed.protocol !== "https:") {
    throw new AppError("coverImageUrl must start with https://", 400);
  }

  return url;
};

// Creator, or owner/admin of the fundraiser's NGO
const getManageableFundraiser = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Invalid fundraiser ID", 400);
  }

  const fundraiser = await Fundraiser.findById(id);

  if (!fundraiser) {
    throw new AppError("Fundraiser not found", 404);
  }

  let allowed = String(fundraiser.createdBy) === String(userId);

  if (!allowed && fundraiser.ngo) {
    allowed = !!(await NGO.exists({
      _id: fundraiser.ngo,
      status: { $ne: "suspended" },
      members: {
        $elemMatch: { user: userId, role: { $in: ["owner", "admin"] } },
      },
    }));
  }

  if (!allowed) {
    throw new AppError(
      "You do not have permission to manage this fundraiser",
      403,
    );
  }

  return fundraiser;
};

// POST /fundraisers
export const createFundraiser = asyncHandler(async (req, res) => {
  const { title, story, goalAmount } = req.body;

  if (!isText(title) || !isText(story)) {
    throw new AppError("title and story are required", 400);
  }

  const data = {
    title: title.trim(),
    story: story.trim(),
    goalAmount: validateGoal(goalAmount),
    createdBy: req.user._id,
  };

  if (req.body.category !== undefined) {
    if (typeof req.body.category !== "string") {
      throw new AppError("category must be a string", 400);
    }
    data.category = req.body.category.trim();
  }

  if (req.body.coverImageUrl !== undefined) {
    data.coverImageUrl = parseImageUrl(req.body.coverImageUrl);
  }

  if (req.body.currency !== undefined) {
    data.currency = parseCurrency(req.body.currency);
  }

  if (
    req.body.ngo !== undefined &&
    req.body.ngo !== null &&
    req.body.ngo !== ""
  ) {
    if (!mongoose.isValidObjectId(req.body.ngo)) {
      throw new AppError("Invalid NGO ID", 400);
    }

    // The NGO must exist, not be suspended, and the user must belong to it
    const ngo = await NGO.findOne({
      _id: req.body.ngo,
      status: { $ne: "suspended" },
      "members.user": req.user._id,
    });

    if (!ngo) {
      throw new AppError(
        "You can only start a fundraiser for an NGO you belong to",
        403,
      );
    }

    data.ngo = ngo._id;
  }

  if (req.body.deadline !== undefined) {
    data.deadline = parseDeadline(req.body.deadline);
  }

  if (req.body.status !== undefined) {
    if (!CREATE_STATUSES.includes(req.body.status)) {
      throw new AppError("A new fundraiser must be 'draft' or 'active'", 400);
    }
    data.status = req.body.status;
  }

  const fundraiser = await Fundraiser.create(data);

  res.status(201).json({
    success: true,
    data: { fundraiser },
  });
});

// GET /fundraisers
export const listFundraisers = asyncHandler(async (req, res) => {
  const { search, category, status, ngo } = req.query;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

  const filter = {};

  if (isText(search)) {
    filter.$text = { $search: search.trim() };
  }

  if (isText(category)) {
    filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, "i");
  }

  if (isText(status)) {
    // Drafts are private. They are only available through GET /fundraisers/mine
    if (!ALLOWED_STATUSES.includes(status) || status === "draft") {
      throw new AppError("Invalid fundraiser status", 400);
    }
    filter.status = status;
  } else {
    filter.status = { $ne: "draft" };
  }

  if (isText(ngo)) {
    if (!mongoose.isValidObjectId(ngo)) {
      throw new AppError("Invalid NGO ID", 400);
    }
    filter.ngo = ngo;
  }

  const [fundraisers, total] = await Promise.all([
    Fundraiser.find(filter)
      .populate("createdBy", "fullName")
      .select("-__v")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Fundraiser.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      fundraisers,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /fundraisers/mine  (logged in, includes drafts)
export const listMyFundraisers = asyncHandler(async (req, res) => {
  const fundraisers = await Fundraiser.find({ createdBy: req.user._id })
    .select("-__v")
    .sort("-createdAt")
    .lean();

  res.json({
    success: true,
    data: { fundraisers },
  });
});

// GET /fundraisers/:id
export const getFundraiser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError("Invalid fundraiser ID", 400);
  }

  const fundraiser = await Fundraiser.findById(req.params.id)
    .populate("createdBy", "fullName")
    .lean();

  if (!fundraiser || fundraiser.status === "draft") {
    throw new AppError("Fundraiser not found", 404);
  }

  res.json({
    success: true,
    data: { fundraiser },
  });
});

// PATCH /fundraisers/:id
export const updateFundraiser = asyncHandler(async (req, res) => {
  const fundraiser = await getManageableFundraiser(req.params.id, req.user._id);

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] === undefined) continue;

    if (field === "title" || field === "story") {
      if (!isText(req.body[field])) {
        throw new AppError(`${field} must be a non-empty string`, 400);
      }
      fundraiser[field] = req.body[field].trim();
      continue;
    }

    if (field === "goalAmount") {
      const amount = validateGoal(req.body.goalAmount);

      if (amount < fundraiser.raisedAmount) {
        throw new AppError(
          "goalAmount cannot be lower than the amount already raised",
          400,
        );
      }

      fundraiser.goalAmount = amount;
      continue;
    }

    if (field === "deadline") {
      fundraiser.deadline = parseDeadline(req.body.deadline);
      continue;
    }

    if (field === "status") {
      if (!ALLOWED_STATUSES.includes(req.body.status)) {
        throw new AppError("Invalid fundraiser status", 400);
      }
      fundraiser.status = req.body.status;
      continue;
    }

    if (field === "currency") {
      fundraiser.currency = parseCurrency(req.body.currency);
      continue;
    }

    if (field === "coverImageUrl") {
      fundraiser.coverImageUrl = parseImageUrl(req.body.coverImageUrl);
      continue;
    }

    // category
    if (typeof req.body[field] !== "string") {
      throw new AppError(`${field} must be a string`, 400);
    }
    fundraiser[field] = req.body[field].trim();
  }

  // raisedAmount, createdBy and ngo are never editable here
  await fundraiser.save();

  res.json({
    success: true,
    data: { fundraiser },
  });
});

// DELETE /fundraisers/:id
export const deleteFundraiser = asyncHandler(async (req, res) => {
  const fundraiser = await getManageableFundraiser(req.params.id, req.user._id);

  // Donations keep a record of money given, so they must not be orphaned
  const hasDonations = await Donation.exists({ fundraiser: fundraiser._id });

  if (hasDonations) {
    throw new AppError(
      "This fundraiser has donations and can't be deleted. Close it instead.",
      409,
    );
  }

  await fundraiser.deleteOne();

  res.json({
    success: true,
    message: "Fundraiser deleted successfully",
  });
});
