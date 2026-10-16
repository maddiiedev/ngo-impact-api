import mongoose from "mongoose";
import Opportunity from "../models/Opportunity.js";
import Application from "../models/Application.js";
import Shift from "../models/Shift.js";
import NGO from "../models/NGO.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  isText, escapeRegex, parseDate, parsePositiveInt, parseStringList, parseBoolean,
} from "../utils/validators.js";
import {
  getManageableOpportunity, getVisibleOpportunity, runInTransaction,
} from "../utils/volunteerService.js";

const STATUSES = ["draft", "open", "closed", "cancelled"];
const CREATE_STATUSES = ["draft", "open"];
const TRANSITIONS = {
  draft: ["open", "cancelled"],
  open: ["closed", "cancelled"],
  closed: ["open"],
  cancelled: [],
};

const parsePaging = (query) => ({
  page: Math.max(parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50),
});

const withSpotsLeft = ({ createdBy, __v, ...o }) => ({
  ...o,
  spotsLeft: Math.max(o.spots - o.acceptedCount, 0),
});

const parseText = (value, label, max) => {
  if (!isText(value) || value.trim().length > max) {
    throw new AppError(`${label} must be a non-empty string of up to ${max} characters`, 400);
  }
  return value.trim();
};

const parseOptionalText = (value, label, max) => {
  if (typeof value !== "string" || value.trim().length > max) {
    throw new AppError(`${label} must be a string of up to ${max} characters`, 400);
  }
  return value.trim();
};

// Reads whichever of the three dates were sent. A null or "" clears the date.
const readDates = (body) => {
  const out = {};
  const now = new Date();

  for (const field of ["startDate", "endDate", "applicationDeadline"]) {
    if (body[field] === undefined) continue;

    const date = parseDate(body[field], field);
    if (date && field !== "startDate" && date <= now) {
      throw new AppError(`${field} must be in the future`, 400);
    }
    out[field] = date;
  }
  return out;
};

const checkDateOrder = ({ startDate, endDate }) => {
  if (startDate && endDate && endDate <= startDate) {
    throw new AppError("endDate must be after startDate", 400);
  }
};

// POST /ngos/:ngoId/opportunities   (ngoRole("owner", "admin") runs first and sets req.ngo)
export const createOpportunity = asyncHandler(async (req, res) => {
  const { body } = req;

  const data = {
    ngo: req.ngo._id,
    createdBy: req.user._id,
    title: parseText(body.title, "title", 150),
    description: parseText(body.description, "description", 5000),
    spots: parsePositiveInt(body.spots, "spots", 10000),
  };

  if (body.category !== undefined) data.category = parseOptionalText(body.category, "category", 50);
  if (body.location !== undefined) data.location = parseOptionalText(body.location, "location", 200);
  if (body.isRemote !== undefined) data.isRemote = parseBoolean(body.isRemote, "isRemote");
  if (body.skillsRequired !== undefined) data.skillsRequired = parseStringList(body.skillsRequired, "skillsRequired");

  Object.assign(data, readDates(body));
  checkDateOrder(data);

  if (body.status !== undefined) {
    if (!CREATE_STATUSES.includes(body.status)) {
      throw new AppError("A new opportunity must be 'draft' or 'open'", 400);
    }
    data.status = body.status;
  }

  const opportunity = await Opportunity.create(data);

  res.status(201).json({ success: true, data: { opportunity: withSpotsLeft(opportunity.toObject()) } });
});

// GET /opportunities   (public: open, not past deadline, NGO not suspended)
export const listOpportunities = asyncHandler(async (req, res) => {
  const { search, category, ngo, skill, remote } = req.query;
  const { page, limit } = parsePaging(req.query);

  const suspendedIds = await NGO.find({ status: "suspended" }).distinct("_id");

  const filter = {
    status: "open",
    ngo: { $nin: suspendedIds },
    $or: [{ applicationDeadline: null }, { applicationDeadline: { $gt: new Date() } }],
  };

  if (isText(search)) filter.$text = { $search: search.trim() };
  if (isText(category)) filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, "i");
  if (isText(skill)) filter.skillsRequired = skill.trim().toLowerCase();
  if (remote === "true") filter.isRemote = true;

  if (isText(ngo)) {
    if (!mongoose.isValidObjectId(ngo)) throw new AppError("Invalid NGO ID", 400);
    if (suspendedIds.some((id) => String(id) === ngo.trim())) throw new AppError("NGO not found", 404);
    filter.ngo = ngo.trim();
  }

  const [opportunities, total] = await Promise.all([
    Opportunity.find(filter)
      .populate("ngo", "name logoUrl")
      .select("-__v")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Opportunity.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { opportunities: opportunities.map(withSpotsLeft), page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /opportunities/:id   (public)
export const getOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await getVisibleOpportunity(req.params.id);
  res.json({ success: true, data: { opportunity: withSpotsLeft(opportunity) } });
});

// GET /ngos/:id/opportunities   (logged in; owner and admin also see drafts)
export const listNgoOpportunities = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Invalid NGO ID", 400);

  const ngo = await NGO.findById(req.params.id).lean();
  if (!ngo) throw new AppError("NGO not found", 404);

  const membership = ngo.members.find((m) => String(m.user) === String(req.user._id));
  if (ngo.status === "suspended" && !membership) throw new AppError("NGO not found", 404);

  const isManager = membership && ["owner", "admin"].includes(membership.role);
  const { page, limit } = parsePaging(req.query);

  const filter = { ngo: ngo._id };
  if (!isManager) filter.status = { $ne: "draft" };

  const [opportunities, total] = await Promise.all([
    Opportunity.find(filter)
      .select("-__v")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Opportunity.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { opportunities: opportunities.map(withSpotsLeft), page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH /opportunities/:id   (manager)
export const updateOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await getManageableOpportunity(req.params.id, req.user._id);
  const { body } = req;

  if (opportunity.status === "cancelled") throw new AppError("A cancelled opportunity can't be edited", 409);

  if (body.title !== undefined) opportunity.title = parseText(body.title, "title", 150);
  if (body.description !== undefined) opportunity.description = parseText(body.description, "description", 5000);
  if (body.category !== undefined) opportunity.category = parseOptionalText(body.category, "category", 50);
  if (body.location !== undefined) opportunity.location = parseOptionalText(body.location, "location", 200);
  if (body.isRemote !== undefined) opportunity.isRemote = parseBoolean(body.isRemote, "isRemote");
  if (body.skillsRequired !== undefined) {
    opportunity.skillsRequired = parseStringList(body.skillsRequired, "skillsRequired");
  }

  if (body.spots !== undefined) {
    const spots = parsePositiveInt(body.spots, "spots", 10000);
    if (spots < opportunity.acceptedCount) {
      throw new AppError("spots can't be lower than the number of volunteers already accepted", 400);
    }
    opportunity.spots = spots;
  }

  opportunity.set(readDates(body));
  checkDateOrder(opportunity);

  // ngo, createdBy, acceptedCount and status can't be changed here
  await opportunity.save();

  res.json({ success: true, data: { opportunity: withSpotsLeft(opportunity.toObject()) } });
});

// PATCH /opportunities/:id/status   (manager)
export const updateOpportunityStatus = asyncHandler(async (req, res) => {
  const opportunity = await getManageableOpportunity(req.params.id, req.user._id);
  const { status } = req.body;

  if (!STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${STATUSES.join(", ")}`, 400);
  }
  if (!TRANSITIONS[opportunity.status].includes(status)) {
    throw new AppError(`Can't change a ${opportunity.status} opportunity to ${status}`, 409);
  }

  if (status === "open") {
    const now = new Date();
    if (opportunity.endDate && opportunity.endDate <= now) {
      throw new AppError("The endDate has passed. Update it before opening.", 400);
    }
    if (opportunity.applicationDeadline && opportunity.applicationDeadline <= now) {
      throw new AppError("The applicationDeadline has passed. Update it before opening.", 400);
    }
    if (opportunity.acceptedCount >= opportunity.spots) {
      throw new AppError("All spots are filled. Increase spots before opening.", 409);
    }
  }

  if (status === "cancelled") {
    // Pending applications and upcoming shifts are closed out together with the cancellation
    await runInTransaction(async (session) => {
      await Application.updateMany(
        { opportunity: opportunity._id, status: "pending" },
        {
          status: "rejected",
          rejectionReason: "This opportunity was cancelled",
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
        },
        { session }
      );
      await Shift.updateMany(
        { opportunity: opportunity._id, status: "scheduled" },
        { status: "cancelled" },
        { session }
      );
      await Opportunity.updateOne({ _id: opportunity._id }, { status: "cancelled" }, { session });
    });
    opportunity.status = "cancelled";
  } else {
    opportunity.status = status;
    await opportunity.save();
  }

  res.json({ success: true, data: { opportunity: withSpotsLeft(opportunity.toObject()) } });
});

// DELETE /opportunities/:id   (manager)
export const deleteOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await getManageableOpportunity(req.params.id, req.user._id);

  const [hasApplications, hasShifts] = await Promise.all([
    Application.exists({ opportunity: opportunity._id }),
    Shift.exists({ opportunity: opportunity._id }),
  ]);
  if (hasApplications || hasShifts) {
    throw new AppError("This opportunity has applications or shifts and can't be deleted. Cancel it instead.", 409);
  }

  await opportunity.deleteOne();

  res.json({ success: true, message: "Opportunity deleted successfully" });
});