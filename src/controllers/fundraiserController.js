import mongoose from "mongoose";
import Fundraiser from "../models/Fundraiser.js";
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

const parseDeadline = (value) => {
  if (value === null || value === "") return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("deadline must be a valid date", 400);
  }

  return date;
};

const validateGoal = (value) => {
  const amount = Number(value);

  if (
    value === "" ||
    value === null ||
    value === undefined ||
    !Number.isFinite(amount) ||
    amount < 1
  ) {
    throw new AppError(
      "goalAmount must be a number greater than or equal to 1",
      400,
    );
  }

  return amount;
};

const getFundraiserForOwner = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Invalid fundraiser ID", 400);
  }

  const fundraiser = await Fundraiser.findById(id);

  if (!fundraiser) {
    throw new AppError("Fundraiser not found", 404);
  }

  if (String(fundraiser.createdBy) !== String(userId)) {
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

  for (const field of ["category", "coverImageUrl", "currency"]) {
    if (req.body[field] !== undefined) {
      if (typeof req.body[field] !== "string") {
        throw new AppError(`${field} must be a string`, 400);
      }

      data[field] = req.body[field].trim();
    }
  }

  if (
    req.body.ngo !== undefined &&
    req.body.ngo !== null &&
    req.body.ngo !== ""
  ) {
    if (!mongoose.isValidObjectId(req.body.ngo)) {
      throw new AppError("Invalid NGO ID", 400);
    }

    data.ngo = req.body.ngo;
  }

  if (req.body.deadline !== undefined) {
    data.deadline = parseDeadline(req.body.deadline);
  }

  if (req.body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(req.body.status)) {
      throw new AppError("Invalid fundraiser status", 400);
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
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new AppError("Invalid fundraiser status", 400);
    }

    filter.status = status;
  } else {
    // Hide draft fundraisers from the default public listing.
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
  const fundraiser = await getFundraiserForOwner(req.params.id, req.user._id);

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
      fundraiser.goalAmount = validateGoal(req.body.goalAmount);
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

    if (typeof req.body[field] !== "string") {
      throw new AppError(`${field} must be a string`, 400);
    }

    fundraiser[field] = req.body[field].trim();
  }

  // Never allow clients to edit raisedAmount or createdBy.
  await fundraiser.save();

  res.json({
    success: true,
    data: { fundraiser },
  });
});

// DELETE /fundraisers/:id
export const deleteFundraiser = asyncHandler(async (req, res) => {
  const fundraiser = await getFundraiserForOwner(req.params.id, req.user._id);

  await fundraiser.deleteOne();

  res.json({
    success: true,
    message: "Fundraiser deleted successfully",
  });
});
