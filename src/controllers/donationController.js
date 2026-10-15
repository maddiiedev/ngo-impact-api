// src/controllers/donationController.js
import mongoose from "mongoose";
import Donation from "../models/Donation.js";
import Campaign from "../models/Campaign.js";
import Fundraiser from "../models/Fundraiser.js";
import NGO from "../models/NGO.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isText } from "../utils/validators.js";
import { inspectReceipt, saveReceipt, deleteReceipt, signedReceiptUrl } from "../utils/receipts.js"; // CHANGED
import { canReceive, getManagedNgoIds } from "../utils/donationAccess.js";

const MODELS = { campaign: Campaign, fundraiser: Fundraiser };
const LABELS = { campaign: "Campaign", fundraiser: "Fundraiser" };
const STATUSES = ["pending", "confirmed", "rejected"];
const MAX_AMOUNT = 1_000_000_000;
const MAX_PENDING_PER_TARGET = 3;

const parsePaging = (query) => ({
  page: Math.max(parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50),
});

const parseStatus = (value, fallback) => {
  if (!isText(value)) return fallback;
  if (!STATUSES.includes(value)) throw new AppError(`status must be one of: ${STATUSES.join(", ")}`, 400);
  return value;
};

const checkId = (id, label = "donation") => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`Invalid ${label} ID`, 400);
};

// Never expose the Cloudinary id or hash. Clients get a receipt URL instead.
const formatDonation = (d) => {
  const { receiptPublicId, receiptMimeType, receiptHash, __v, ...rest } = d; // CHANGED
  return { ...rest, receiptUrl: `/api/donations/${d._id}/receipt` };
};

// Loads a campaign or fundraiser that the public is allowed to see
const loadVisibleTarget = async (type, id) => {
  checkId(id, type);

  const target = await MODELS[type].findById(id).lean();
  if (!target || target.status === "draft") throw new AppError(`${LABELS[type]} not found`, 404);

  if (target.ngo) {
    const ngo = await NGO.findById(target.ngo).select("status").lean();
    if (!ngo || ngo.status === "suspended") throw new AppError(`${LABELS[type]} not found`, 404);
  }

  return target;
};

const assertAcceptingDonations = (type, target) => {
  const now = new Date();

  if (target.status !== "active") throw new AppError(`This ${type} is not accepting donations`, 409);

  if (type === "campaign") {
    if (target.startDate > now) throw new AppError("This campaign has not started yet", 409);
    if (target.endDate && target.endDate <= now) throw new AppError("This campaign has ended", 409);
  } else if (target.deadline && target.deadline <= now) {
    throw new AppError("This fundraiser's deadline has passed", 409);
  }
};

// Loads a donation and works out whether the user is its donor or its receiver
const loadParticipantDonation = async (id, userId) => {
  checkId(id);

  const donation = await Donation.findById(id).lean();
  if (!donation) throw new AppError("Donation not found", 404);

  const isDonor = String(donation.donor) === String(userId);
  const isReceiver = await canReceive(donation, userId);
  if (!isDonor && !isReceiver) throw new AppError("Donation not found", 404);

  return { donation, isDonor, isReceiver };
};

const loadReceivableDonation = async (id, userId) => {
  checkId(id);

  const donation = await Donation.findById(id);
  if (!donation) throw new AppError("Donation not found", 404);

  if (!(await canReceive(donation, userId))) {
    throw new AppError("You do not have permission to review this donation", 403);
  }
  return donation;
};

// POST /campaigns/:id/donations and POST /fundraisers/:id/donations
// multipart/form-data: receipt (file), amount, message?, isAnonymous?
export const createDonation = (type) =>
  asyncHandler(async (req, res) => {
    const target = await loadVisibleTarget(type, req.params.id);
    assertAcceptingDonations(type, target);

    if (!req.file) throw new AppError('A receipt is required. Upload it in the "receipt" field', 400);

    const rawAmount = typeof req.body.amount === "string" ? req.body.amount.trim() : "";
    const amount = rawAmount === "" ? NaN : Math.round(Number(rawAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_AMOUNT) {
      throw new AppError(`amount must be a number between 1 and ${MAX_AMOUNT}`, 400);
    }

    const message = typeof req.body.message === "string" ? req.body.message.trim() : undefined;
    const isAnonymous = req.body.isAnonymous === "true";

    const receipt = inspectReceipt(req.file.buffer);

    if (await Donation.exists({ receiptHash: receipt.hash, status: { $ne: "rejected" } })) {
      throw new AppError("This receipt has already been submitted", 409);
    }

    const pending = await Donation.countDocuments({
      donor: req.user._id,
      [type]: target._id,
      status: "pending",
    });
    if (pending >= MAX_PENDING_PER_TARGET) {
      throw new AppError(`You already have several donations awaiting review for this ${type}`, 429);
    }

    const receiptPublicId = await saveReceipt(req.file.buffer); // CHANGED: uploads to Cloudinary

    try {
      const donation = await Donation.create({
        donor: req.user._id,
        [type]: target._id,
        amount,
        currency: target.currency, // always the target's currency, never from the client
        isAnonymous,
        message: message || undefined,
        receiptPublicId, // CHANGED
        receiptMimeType: receipt.mime,
        receiptHash: receipt.hash,
      });

      res.status(201).json({ success: true, data: { donation: formatDonation(donation.toObject()) } });
    } catch (err) {
      await deleteReceipt(receiptPublicId); // CHANGED: don't leave an orphaned file in Cloudinary
      throw err;
    }
  });

// GET /campaigns/:id/donations and GET /fundraisers/:id/donations  (public donor wall)
export const listPublicDonations = (type) =>
  asyncHandler(async (req, res) => {
    const target = await loadVisibleTarget(type, req.params.id);
    const { page, limit } = parsePaging(req.query);

    const filter = { [type]: target._id, status: "confirmed" };

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .populate("donor", "fullName")
        .sort("-reviewedAt")
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Donation.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        donations: donations.map((d) => ({
          id: d._id,
          donorName: d.isAnonymous || !d.donor ? "Anonymous" : d.donor.fullName,
          amount: d.amount,
          currency: d.currency,
          message: d.message || null,
          createdAt: d.reviewedAt || d.createdAt,
        })),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

// GET /donations/mine
export const listMyDonations = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const status = parseStatus(req.query.status, null);

  const filter = { donor: req.user._id };
  if (status) filter.status = status;

  const [donations, total] = await Promise.all([
    Donation.find(filter)
      .populate("campaign", "title")
      .populate("fundraiser", "title")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Donation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { donations: donations.map(formatDonation), page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /donations/received?status=pending   (donations the user can confirm or reject)
export const listReceivedDonations = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const status = parseStatus(req.query.status, "pending");

  const ngoIds = await getManagedNgoIds(req.user._id);
  const [campaignIds, fundraiserIds] = await Promise.all([
    Campaign.find({ ngo: { $in: ngoIds } }).distinct("_id"),
    Fundraiser.find({ $or: [{ createdBy: req.user._id }, { ngo: { $in: ngoIds } }] }).distinct("_id"),
  ]);

  const filter = {
    status,
    $or: [{ campaign: { $in: campaignIds } }, { fundraiser: { $in: fundraiserIds } }],
  };

  const [donations, total] = await Promise.all([
    Donation.find(filter)
      .populate("donor", "fullName email") // receivers need this to match the bank transfer
      .populate("campaign", "title")
      .populate("fundraiser", "title")
      .sort(status === "pending" ? "createdAt" : "-createdAt") // oldest pending first
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Donation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { donations: donations.map(formatDonation), page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /donations/:id   (the donor or a receiver)
export const getDonation = asyncHandler(async (req, res) => {
  const { donation, isReceiver } = await loadParticipantDonation(req.params.id, req.user._id);

  const populated = await Donation.populate(donation, [
    { path: "campaign", select: "title" },
    { path: "fundraiser", select: "title" },
    ...(isReceiver ? [{ path: "donor", select: "fullName email" }] : []),
  ]);

  res.json({ success: true, data: { donation: formatDonation(populated) } });
});

// GET /donations/:id/receipt   (the donor or a receiver) -> a link that expires in 5 minutes
export const getReceipt = asyncHandler(async (req, res) => { // CHANGED: returns a link, not the file
  const { donation } = await loadParticipantDonation(req.params.id, req.user._id);

  const { url, expiresAt } = signedReceiptUrl(donation.receiptPublicId, donation.receiptMimeType);

  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    success: true,
    data: { url, expiresAt, mimeType: donation.receiptMimeType },
  });
});

// PATCH /donations/:id/confirm
export const confirmDonation = asyncHandler(async (req, res) => {
  const donation = await loadReceivableDonation(req.params.id, req.user._id);

  if (String(donation.donor) === String(req.user._id)) {
    throw new AppError("You can't confirm your own donation", 403);
  }

  const TargetModel = donation.campaign ? Campaign : Fundraiser;
  const targetId = donation.campaign || donation.fundraiser;

  const session = await mongoose.startSession();
  let confirmed;

  try {
    // The status change and the raisedAmount increase succeed or fail together
    await session.withTransaction(async () => {
      confirmed = await Donation.findOneAndUpdate(
        { _id: donation._id, status: "pending" }, // only pending ones, so it can't count twice
        { status: "confirmed", reviewedBy: req.user._id, reviewedAt: new Date() },
        { new: true, session }
      );
      if (!confirmed) throw new AppError("This donation has already been reviewed", 409);

      const result = await TargetModel.updateOne(
        { _id: targetId },
        { $inc: { raisedAmount: confirmed.amount } },
        { session }
      );
      if (result.matchedCount === 0) throw new AppError("The campaign or fundraiser no longer exists", 409);
    });
  } finally {
    await session.endSession();
  }

  res.json({ success: true, data: { donation: formatDonation(confirmed.toObject()) } });
});

// PATCH /donations/:id/reject   { reason }
export const rejectDonation = asyncHandler(async (req, res) => {
  const donation = await loadReceivableDonation(req.params.id, req.user._id);

  const { reason } = req.body;
  if (!isText(reason) || reason.trim().length > 300) {
    throw new AppError("A reason (up to 300 characters) is required", 400);
  }

  const rejected = await Donation.findOneAndUpdate(
    { _id: donation._id, status: "pending" },
    { status: "rejected", reviewedBy: req.user._id, reviewedAt: new Date(), rejectionReason: reason.trim() },
    { new: true }
  );
  if (!rejected) throw new AppError("This donation has already been reviewed", 409);

  res.json({ success: true, data: { donation: formatDonation(rejected.toObject()) } });
});

// DELETE /donations/:id   (the donor can withdraw a donation that is still pending)
export const cancelDonation = asyncHandler(async (req, res) => {
  checkId(req.params.id);

  const donation = await Donation.findOneAndDelete({
    _id: req.params.id,
    donor: req.user._id,
    status: "pending",
  });
  if (!donation) throw new AppError("Pending donation not found", 404);

  await deleteReceipt(donation.receiptPublicId); // CHANGED: removes the file from Cloudinary

  res.json({ success: true, message: "Donation withdrawn" });
});