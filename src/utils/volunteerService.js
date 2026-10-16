import mongoose from "mongoose";
import Opportunity from "../models/Opportunity.js";
import Application from "../models/Application.js";
import Shift from "../models/Shift.js";
import AppError from "./AppError.js";
import { isNgoManager } from "./donationAccess.js";

export const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
};

// An opportunity the user may manage (owner or admin of its NGO)
export const getManageableOpportunity = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid opportunity ID", 400);

  const opportunity = await Opportunity.findById(id);
  if (!opportunity) throw new AppError("Opportunity not found", 404);

  if (!(await isNgoManager(opportunity.ngo, userId))) {
    throw new AppError("You do not have permission to manage this opportunity", 403);
  }
  return opportunity;
};

// An opportunity the public may see: not a draft, and its NGO isn't suspended
export const getVisibleOpportunity = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid opportunity ID", 400);

  const opportunity = await Opportunity.findById(id).populate("ngo", "name logoUrl status").lean();
  if (
    !opportunity ||
    opportunity.status === "draft" ||
    !opportunity.ngo ||
    opportunity.ngo.status === "suspended"
  ) {
    throw new AppError("Opportunity not found", 404);
  }
  return opportunity;
};

export const getManageableShift = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid shift ID", 400);

  const shift = await Shift.findById(id);
  if (!shift) throw new AppError("Shift not found", 404);

  const opportunity = await getManageableOpportunity(shift.opportunity, userId);
  return { shift, opportunity };
};

// Moves an ACCEPTED application out of "accepted" (reject or withdraw): frees the spot and
// removes the volunteer from upcoming shifts. Call it inside a transaction.
export const releaseAccepted = async (application, update, session) => {
  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: "accepted" },
    update,
    { new: true, session }
  );
  if (!updated) throw new AppError("This application has already changed", 409);

  await Opportunity.updateOne(
    { _id: application.opportunity, acceptedCount: { $gt: 0 } },
    { $inc: { acceptedCount: -1 } },
    { session }
  );
  await Shift.updateMany(
    { opportunity: application.opportunity, status: "scheduled", startTime: { $gt: new Date() } },
    { $pull: { signups: { user: application.volunteer } } },
    { session }
  );
  return updated;
};