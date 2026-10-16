import mongoose from "mongoose";
import Application from "../models/Application.js";
import Opportunity from "../models/Opportunity.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isText } from "../utils/validators.js";
import { isNgoManager } from "../utils/donationAccess.js";
import {
  getManageableOpportunity, getVisibleOpportunity, releaseAccepted, runInTransaction,
} from "../utils/volunteerService.js";

const STATUSES = ["pending", "accepted", "rejected", "withdrawn"];

const parsePaging = (query) => ({
  page: Math.max(parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50),
});

const parseStatus = (value) => {
  if (!isText(value)) return null;
  if (!STATUSES.includes(value)) throw new AppError(`status must be one of: ${STATUSES.join(", ")}`, 400);
  return value;
};

const checkId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid application ID", 400);
};

// Loads an application the user is allowed to review: a manager of its NGO, and not the applicant
const loadReviewableApplication = async (id, userId) => {
  checkId(id);

  const application = await Application.findById(id);
  if (!application) throw new AppError("Application not found", 404);

  const opportunity = await Opportunity.findById(application.opportunity).select("ngo").lean();
  if (!opportunity || !(await isNgoManager(opportunity.ngo, userId))) {
    throw new AppError("You do not have permission to review this application", 403);
  }
  if (String(application.volunteer) === String(userId)) {
    throw new AppError("You can't review your own application", 403);
  }
  return application;
};

// POST /opportunities/:id/applications   { message? }
export const applyToOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await getVisibleOpportunity(req.params.id);
  const now = new Date();

  if (opportunity.status !== "open") throw new AppError("This opportunity is not accepting applications", 409);
  if (opportunity.applicationDeadline && opportunity.applicationDeadline <= now) {
    throw new AppError("The application deadline has passed", 409);
  }
  if (opportunity.acceptedCount >= opportunity.spots) {
    throw new AppError("All spots for this opportunity are filled", 409);
  }

  let message;
  if (req.body.message !== undefined) {
    if (typeof req.body.message !== "string" || req.body.message.trim().length > 1000) {
      throw new AppError("message must be a string of up to 1000 characters", 400);
    }
    message = req.body.message.trim() || undefined;
  }

  const existing = await Application.findOne({ opportunity: opportunity._id, volunteer: req.user._id });
  if (existing && existing.status !== "withdrawn") {
    throw new AppError(`You have already applied (${existing.status})`, 409);
  }

  try {
    let application;

    if (existing) {
      // Applying again after withdrawing reopens the old application
      existing.status = "pending";
      existing.message = message;
      existing.reviewedBy = null;
      existing.reviewedAt = null;
      existing.rejectionReason = undefined;
      application = await existing.save();
    } else {
      application = await Application.create({
        opportunity: opportunity._id,
        volunteer: req.user._id,
        message,
      });
    }

    res.status(201).json({ success: true, data: { application: application.toObject() } });
  } catch (err) {
    if (err.code === 11000) throw new AppError("You have already applied to this opportunity", 409);
    throw err;
  }
});

// GET /opportunities/:id/applications   (manager)
export const listOpportunityApplications = asyncHandler(async (req, res) => {
  const opportunity = await getManageableOpportunity(req.params.id, req.user._id);
  const { page, limit } = parsePaging(req.query);
  const status = parseStatus(req.query.status);

  const filter = { opportunity: opportunity._id };
  if (status) filter.status = status;

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate("volunteer", "fullName email phoneNumber") // managers need this to contact them
      .select("-__v")
      .sort(status === "pending" ? "createdAt" : "-createdAt") // oldest pending first
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Application.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { applications, page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /applications/mine
export const listMyApplications = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const status = parseStatus(req.query.status);

  const filter = { volunteer: req.user._id };
  if (status) filter.status = status;

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate({ path: "opportunity", select: "title status ngo", populate: { path: "ngo", select: "name" } })
      .select("-__v")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Application.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { applications, page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /applications/:id   (the volunteer or a manager)
export const getApplication = asyncHandler(async (req, res) => {
  checkId(req.params.id);

  const application = await Application.findById(req.params.id)
    .populate("volunteer", "fullName email phoneNumber")
    .populate({ path: "opportunity", select: "title status ngo", populate: { path: "ngo", select: "name" } })
    .select("-__v")
    .lean();
  if (!application || !application.opportunity?.ngo) throw new AppError("Application not found", 404);

  const isVolunteer = String(application.volunteer._id) === String(req.user._id);
  if (!isVolunteer && !(await isNgoManager(application.opportunity.ngo._id, req.user._id))) {
    throw new AppError("Application not found", 404);
  }

  res.json({ success: true, data: { application } });
});

// PATCH /applications/:id/accept   (manager)
export const acceptApplication = asyncHandler(async (req, res) => {
  const application = await loadReviewableApplication(req.params.id, req.user._id);

  let accepted;
  await runInTransaction(async (session) => {
    accepted = await Application.findOneAndUpdate(
      { _id: application._id, status: "pending" },
      { status: "accepted", reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true, session }
    );
    if (!accepted) throw new AppError("This application is not pending", 409);

    // Takes a spot only if the opportunity is open and not full. Checked atomically.
    const opportunity = await Opportunity.findOneAndUpdate(
      { _id: application.opportunity, status: "open", $expr: { $lt: ["$acceptedCount", "$spots"] } },
      { $inc: { acceptedCount: 1 } },
      { session }
    );
    if (!opportunity) throw new AppError("This opportunity is full or no longer open", 409);
  });

  res.json({ success: true, data: { application: accepted.toObject() } });
});

// PATCH /applications/:id/reject   { reason? }   (manager; works on pending or accepted)
export const rejectApplication = asyncHandler(async (req, res) => {
  const application = await loadReviewableApplication(req.params.id, req.user._id);

  let reason;
  if (req.body.reason !== undefined) {
    if (!isText(req.body.reason) || req.body.reason.trim().length > 300) {
      throw new AppError("reason must be a string of up to 300 characters", 400);
    }
    reason = req.body.reason.trim();
  }

  const update = {
    status: "rejected",
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    ...(reason && { rejectionReason: reason }),
  };

  let rejected;

  if (application.status === "pending") {
    rejected = await Application.findOneAndUpdate({ _id: application._id, status: "pending" }, update, { new: true });
    if (!rejected) throw new AppError("This application has already been reviewed", 409);
  } else if (application.status === "accepted") {
    await runInTransaction(async (session) => {
      rejected = await releaseAccepted(application, update, session);
    });
  } else {
    throw new AppError(`A ${application.status} application can't be rejected`, 409);
  }

  res.json({ success: true, data: { application: rejected.toObject() } });
});

// PATCH /applications/:id/withdraw   (the volunteer; works on pending or accepted)
export const withdrawApplication = asyncHandler(async (req, res) => {
  checkId(req.params.id);

  const application = await Application.findOne({ _id: req.params.id, volunteer: req.user._id });
  if (!application) throw new AppError("Application not found", 404);

  let withdrawn;

  if (application.status === "pending") {
    withdrawn = await Application.findOneAndUpdate(
      { _id: application._id, status: "pending" },
      { status: "withdrawn" },
      { new: true }
    );
    if (!withdrawn) throw new AppError("This application has already been reviewed", 409);
  } else if (application.status === "accepted") {
    await runInTransaction(async (session) => {
      withdrawn = await releaseAccepted(application, { status: "withdrawn" }, session);
    });
  } else {
    throw new AppError(`A ${application.status} application can't be withdrawn`, 409);
  }

  res.json({ success: true, data: { application: withdrawn.toObject() } });
});