import mongoose from "mongoose";
import Shift from "../models/Shift.js";
import Opportunity from "../models/Opportunity.js";
import Application from "../models/Application.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isText, parseDate, parsePositiveInt } from "../utils/validators.js";
import { isNgoManager } from "../utils/donationAccess.js";
import { getManageableOpportunity, getVisibleOpportunity, getManageableShift } from "../utils/volunteerService.js";

const WHEN = ["upcoming", "past", "all"];
const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

const parsePaging = (query) => ({
  page: Math.max(parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50),
});

const checkId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid shift ID", 400);
};

const parseWhen = (value) => {
  if (!isText(value)) return "upcoming";
  if (!WHEN.includes(value)) throw new AppError(`when must be one of: ${WHEN.join(", ")}`, 400);
  return value;
};

// "upcoming" means not yet finished, so a shift in progress still counts
const whenFilter = (when, now) =>
  when === "upcoming" ? { endTime: { $gt: now } } : when === "past" ? { endTime: { $lte: now } } : {};

const optionalText = (value, label, max) => {
  if (typeof value !== "string" || value.trim().length > max) {
    throw new AppError(`${label} must be a string of up to ${max} characters`, 400);
  }
  return value.trim();
};

// What anyone may see: counts, never who signed up
const publicShift = ({ signups, __v, ...rest }) => ({
  ...rest,
  signedUp: signups.length,
  spotsLeft: Math.max(rest.capacity - signups.length, 0),
});

const checkTimes = (startTime, endTime) => {
  if (endTime <= startTime) throw new AppError("endTime must be after startTime", 400);
  if (endTime - startTime > MAX_SHIFT_MS) throw new AppError("A shift can't be longer than 24 hours", 400);
};

// POST /opportunities/:id/shifts   (manager)
export const createShift = asyncHandler(async (req, res) => {
  const opportunity = await getManageableOpportunity(req.params.id, req.user._id);
  if (opportunity.status === "cancelled") {
    throw new AppError("Shifts can't be added to a cancelled opportunity", 409);
  }

  const { body } = req;
  const startTime = parseDate(body.startTime, "startTime");
  const endTime = parseDate(body.endTime, "endTime");
  if (!startTime || !endTime) throw new AppError("startTime and endTime are required", 400);
  if (startTime <= new Date()) throw new AppError("startTime must be in the future", 400);
  checkTimes(startTime, endTime);

  const data = {
    opportunity: opportunity._id,
    startTime,
    endTime,
    capacity: parsePositiveInt(body.capacity, "capacity", 10000),
  };
  if (body.title !== undefined) data.title = optionalText(body.title, "title", 150);
  if (body.location !== undefined) data.location = optionalText(body.location, "location", 200);

  const shift = await Shift.create(data);

  res.status(201).json({ success: true, data: { shift: publicShift(shift.toObject()) } });
});

// GET /opportunities/:id/shifts   (public)
export const listOpportunityShifts = asyncHandler(async (req, res) => {
  const opportunity = await getVisibleOpportunity(req.params.id);
  const when = parseWhen(req.query.when);
  const { page, limit } = parsePaging(req.query);

  const filter = { opportunity: opportunity._id, ...whenFilter(when, new Date()) };

  const [shifts, total] = await Promise.all([
    Shift.find(filter)
      .sort(when === "past" ? "-startTime" : "startTime")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Shift.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { shifts: shifts.map(publicShift), page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /shifts/mine   (the shifts I've signed up for, plus my total attended hours)
export const listMyShifts = asyncHandler(async (req, res) => {
  const when = parseWhen(req.query.when);
  const { page, limit } = parsePaging(req.query);
  const userId = req.user._id;

  const filter = { "signups.user": userId, ...whenFilter(when, new Date()) };

  const [shifts, total, totals] = await Promise.all([
    Shift.find(filter)
      .populate({ path: "opportunity", select: "title ngo", populate: { path: "ngo", select: "name" } })
      .sort(when === "past" ? "-startTime" : "startTime")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Shift.countDocuments(filter),
    Shift.aggregate([
      { $match: { "signups.user": userId } },
      { $unwind: "$signups" },
      { $match: { "signups.user": userId, "signups.status": "attended" } },
      { $group: { _id: null, hours: { $sum: "$signups.hours" }, shifts: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      shifts: shifts.map((s) => {
        const mine = s.signups.find((x) => String(x.user) === String(userId));
        return { ...publicShift(s), myStatus: mine.status, myHours: mine.hours };
      }),
      totalHours: Math.round((totals[0]?.hours || 0) * 100) / 100,
      attendedShifts: totals[0]?.shifts || 0,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /shifts/:id   (managers also see who signed up)
export const getShift = asyncHandler(async (req, res) => {
  checkId(req.params.id);

  const shift = await Shift.findById(req.params.id).lean();
  if (!shift) throw new AppError("Shift not found", 404);

  const opportunity = await Opportunity.findById(shift.opportunity)
    .select("title status ngo")
    .populate("ngo", "name status")
    .lean();
  if (!opportunity || !opportunity.ngo) throw new AppError("Shift not found", 404);

  const isManager = await isNgoManager(opportunity.ngo._id, req.user._id);
  if (!isManager && (opportunity.status === "draft" || opportunity.ngo.status === "suspended")) {
    throw new AppError("Shift not found", 404);
  }

  const mine = shift.signups.find((s) => String(s.user) === String(req.user._id));
  const result = {
    ...publicShift(shift),
    opportunity: { _id: opportunity._id, title: opportunity.title },
    myStatus: mine ? mine.status : null,
  };

  if (isManager) {
    const populated = await Shift.populate(shift, { path: "signups.user", select: "fullName email phoneNumber" });
    result.signups = populated.signups;
  }

  res.json({ success: true, data: { shift: result } });
});

// PATCH /shifts/:id   (manager)
export const updateShift = asyncHandler(async (req, res) => {
  const { shift } = await getManageableShift(req.params.id, req.user._id);
  const { body } = req;

  if (shift.status !== "scheduled") throw new AppError(`A ${shift.status} shift can't be edited`, 409);

  if (body.title !== undefined) shift.title = optionalText(body.title, "title", 150);
  if (body.location !== undefined) shift.location = optionalText(body.location, "location", 200);

  for (const field of ["startTime", "endTime"]) {
    if (body[field] === undefined) continue;

    const date = parseDate(body[field], field);
    if (!date) throw new AppError(`${field} can't be empty`, 400);
    if (field === "startTime" && date <= new Date()) throw new AppError("startTime must be in the future", 400);
    shift[field] = date;
  }
  checkTimes(shift.startTime, shift.endTime);

  if (body.capacity !== undefined) {
    const capacity = parsePositiveInt(body.capacity, "capacity", 10000);
    if (capacity < shift.signups.length) {
      throw new AppError("capacity can't be lower than the number of volunteers already signed up", 400);
    }
    shift.capacity = capacity;
  }

  await shift.save();

  res.json({ success: true, data: { shift: publicShift(shift.toObject()) } });
});

// PATCH /shifts/:id/status   { status: "completed" | "cancelled" }   (manager)
export const updateShiftStatus = asyncHandler(async (req, res) => {
  const { shift } = await getManageableShift(req.params.id, req.user._id);
  const { status } = req.body;

  if (!["completed", "cancelled"].includes(status)) {
    throw new AppError("status must be 'completed' or 'cancelled'", 400);
  }
  if (shift.status !== "scheduled") throw new AppError(`A ${shift.status} shift can't be changed`, 409);
  if (status === "completed" && shift.startTime > new Date()) {
    throw new AppError("A shift can't be completed before it starts", 409);
  }

  shift.status = status;
  await shift.save();

  res.json({ success: true, data: { shift: publicShift(shift.toObject()) } });
});

// DELETE /shifts/:id   (manager, only with no sign-ups)
export const deleteShift = asyncHandler(async (req, res) => {
  const { shift } = await getManageableShift(req.params.id, req.user._id);

  if (shift.signups.length > 0) {
    throw new AppError("Volunteers have signed up for this shift. Cancel it instead.", 409);
  }

  await shift.deleteOne();

  res.json({ success: true, message: "Shift deleted successfully" });
});

// POST /shifts/:id/join   (a volunteer with an accepted application)
export const joinShift = asyncHandler(async (req, res) => {
  checkId(req.params.id);
  const userId = req.user._id;

  const shift = await Shift.findById(req.params.id).lean();
  if (!shift) throw new AppError("Shift not found", 404);

  const opportunity = await getVisibleOpportunity(shift.opportunity); // 404 for drafts and suspended NGOs
  const now = new Date();

  if (opportunity.status === "cancelled") throw new AppError("This opportunity has been cancelled", 409);
  if (shift.status !== "scheduled" || shift.startTime <= now) {
    throw new AppError("This shift is no longer open for sign-up", 409);
  }

  const accepted = await Application.exists({
    opportunity: shift.opportunity,
    volunteer: userId,
    status: "accepted",
  });
  if (!accepted) {
    throw new AppError("You need an accepted application for this opportunity to join its shifts", 403);
  }

  const clash = await Shift.exists({
    _id: { $ne: shift._id },
    status: "scheduled",
    "signups.user": userId,
    startTime: { $lt: shift.endTime },
    endTime: { $gt: shift.startTime },
  });
  if (clash) throw new AppError("You already have a shift at that time", 409);

  // One atomic update: only adds you if the shift is still open, you aren't on it, and it isn't full
  const result = await Shift.updateOne(
    {
      _id: shift._id,
      status: "scheduled",
      startTime: { $gt: now },
      "signups.user": { $ne: userId },
      $expr: { $lt: [{ $size: "$signups" }, "$capacity"] },
    },
    { $push: { signups: { user: userId, status: "signed_up", hours: 0, joinedAt: now } } }
  );

  if (result.modifiedCount === 0) {
    const fresh = await Shift.findById(shift._id).lean();
    if (fresh?.signups.some((s) => String(s.user) === String(userId))) {
      throw new AppError("You have already joined this shift", 409);
    }
    throw new AppError("This shift is full", 409);
  }

  res.status(201).json({ success: true, message: "You have joined the shift" });
});

// DELETE /shifts/:id/join   (leave before the shift starts)
export const leaveShift = asyncHandler(async (req, res) => {
  checkId(req.params.id);
  const userId = req.user._id;

  const result = await Shift.updateOne(
    {
      _id: req.params.id,
      status: "scheduled",
      startTime: { $gt: new Date() },
      signups: { $elemMatch: { user: userId, status: "signed_up" } },
    },
    { $pull: { signups: { user: userId } } }
  );

  if (result.modifiedCount === 0) {
    throw new AppError("You aren't signed up for this shift, or it has already started", 409);
  }

  res.json({ success: true, message: "You have left the shift" });
});

// PATCH /shifts/:id/attendance   { userId, status: "attended" | "absent", hours? }   (manager)
export const markAttendance = asyncHandler(async (req, res) => {
  const { shift } = await getManageableShift(req.params.id, req.user._id);

  if (shift.status === "cancelled") throw new AppError("This shift was cancelled", 409);
  if (shift.startTime > new Date()) {
    throw new AppError("Attendance can only be marked once the shift has started", 409);
  }

  const { userId, status, hours } = req.body;

  if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) {
    throw new AppError("A valid userId is required", 400);
  }
  if (!["attended", "absent"].includes(status)) {
    throw new AppError("status must be 'attended' or 'absent'", 400);
  }

  const signup = shift.signups.find((s) => String(s.user) === userId);
  if (!signup) throw new AppError("That volunteer isn't signed up for this shift", 404);

  let worked = 0;
  if (status === "attended") {
    if (hours === undefined) {
      worked = Math.round(((shift.endTime - shift.startTime) / 36e5) * 100) / 100; // the shift's length
    } else {
      const h = typeof hours === "string" && hours.trim() !== "" ? Number(hours) : hours;
      if (typeof h !== "number" || !Number.isFinite(h) || h <= 0 || h > 24) {
        throw new AppError("hours must be a number greater than 0 and at most 24", 400);
      }
      worked = Math.round(h * 100) / 100;
    }
  }

  await Shift.updateOne(
    { _id: shift._id, "signups.user": signup.user },
    { $set: { "signups.$.status": status, "signups.$.hours": worked } }
  );

  res.json({ success: true, data: { userId, status, hours: worked } });
});