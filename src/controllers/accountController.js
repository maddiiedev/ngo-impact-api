import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import NGO from "../models/NGO.js";
import Campaign from "../models/Campaign.js";
import Fundraiser from "../models/Fundraiser.js";
import Donation from "../models/Donation.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isText } from "../utils/validators.js";
import { publicUser, issueTokens } from "./authController.js";

const PHONE_PATTERN = /^\+?[0-9\s-]{7,20}$/;

// PATCH /me   { fullName?, phoneNumber? }
export const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phoneNumber } = req.body;

  if (fullName === undefined && phoneNumber === undefined) {
    throw new AppError("Provide fullName and/or phoneNumber to update", 400);
  }

  if (fullName !== undefined) {
    if (!isText(fullName) || fullName.trim().length > 100) {
      throw new AppError("fullName must be a non-empty string of up to 100 characters", 400);
    }
    req.user.fullName = fullName.trim();
  }

  if (phoneNumber !== undefined) {
    if (!isText(phoneNumber) || !PHONE_PATTERN.test(phoneNumber.trim())) {
      throw new AppError("phoneNumber must be a valid phone number", 400);
    }
    req.user.phoneNumber = phoneNumber.trim();
  }

  // A phone number that another account uses fails here with a 409 from the error handler
  await req.user.save();

  res.json({ success: true, data: { user: publicUser(req.user) } });
});

// PATCH /me/password   { currentPassword, newPassword }
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    throw new AppError("currentPassword and newPassword are required", 400);
  }
  if (newPassword.length < 8) throw new AppError("Password must be at least 8 characters", 400);
  if (Buffer.byteLength(newPassword) > 72) throw new AppError("Password must be 72 bytes or fewer", 400);

  // 400, not 401, so a frontend doesn't treat a typo as an expired session
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
    throw new AppError("Current password is incorrect", 400);
  }
  if (await bcrypt.compare(newPassword, req.user.passwordHash)) {
    throw new AppError("New password must be different from the current one", 400);
  }

  req.user.passwordHash = await bcrypt.hash(newPassword, 12);
  req.user.resetPasswordCodeHash = null;
  req.user.resetPasswordExpires = null;

  // issueTokens saves the user and replaces the stored refresh token. Other devices
  // can no longer refresh, so they're signed out once their access token expires.
  const tokens = await issueTokens(req.user);

  res.json({ success: true, message: "Password changed", data: tokens });
});

// POST /me/deactivate   { password }
export const deactivateAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (typeof password !== "string") {
    throw new AppError("password is required to deactivate your account", 400);
  }
  if (!(await bcrypt.compare(password, req.user.passwordHash))) {
    throw new AppError("Password is incorrect", 400);
  }

  // NGOs the user owns: if others belong to them, ownership must be handed over first
  const owned = await NGO.find({ members: { $elemMatch: { user: req.user._id, role: "owner" } } })
    .select("name members")
    .lean();

  const shared = owned.filter((n) => n.members.length > 1);
  if (shared.length) {
    throw new AppError(
      `Transfer ownership of ${shared.map((n) => n.name).join(", ")} before deactivating your account`,
      409
    );
  }
  const soloNgoIds = owned.map((n) => n._id); // owner is the only member: these get suspended

  // Fundraisers that would be closed: personal ones, plus those of a solo NGO
  const fundraiserFilter = {
    $or: [{ createdBy: req.user._id, ngo: null }, { ngo: { $in: soloNgoIds } }],
  };

  const [fundraiserIds, campaignIds] = await Promise.all([
    Fundraiser.find(fundraiserFilter).distinct("_id"),
    Campaign.find({ ngo: { $in: soloNgoIds } }).distinct("_id"),
  ]);

  // Donors may already have sent money, so nobody should be left waiting on this user
  const hasPending = await Donation.exists({
    status: "pending",
    $or: [{ fundraiser: { $in: fundraiserIds } }, { campaign: { $in: campaignIds } }],
  });
  if (hasPending) {
    throw new AppError("Review the pending donations on your fundraisers and NGOs before deactivating your account", 409);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Fundraiser.updateMany(
        { ...fundraiserFilter, status: { $in: ["draft", "active"] } },
        { status: "closed" },
        { session }
      );
      await Campaign.updateMany(
        { ngo: { $in: soloNgoIds }, status: { $in: ["draft", "active"] } },
        { status: "cancelled" },
        { session }
      );
      await NGO.updateMany({ _id: { $in: soloNgoIds } }, { status: "suspended" }, { session });
      await User.updateOne(
        { _id: req.user._id },
        { isActive: false, refreshTokenHash: null, resetPasswordCodeHash: null, resetPasswordExpires: null },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  // protect() checks isActive on every request, so this takes effect immediately
  res.json({ success: true, message: "Your account has been deactivated" });
});