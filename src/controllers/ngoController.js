import mongoose from "mongoose";
import NGO from '../models/NGO.js'; 
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

const EDITABLE = ['name', 'description', 'category', 'email', 'phoneNumber', 'address', 'logoUrl'];

export const createNgo = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!isText(name) || !isText(description)) {
    throw new AppError('name and description are required', 400);
  }

  const data = {};
  EDITABLE.forEach((f) => {
    if (typeof req.body[f] === 'string') data[f] = req.body[f];
  });

  const ngo = await NGO.create({
    ...data,
    createdBy: req.user._id,
    members: [{ user: req.user._id, role: 'owner' }],
  });

  res.status(201).json({ success: true, data: { ngo } });
});

export const listNgos = asyncHandler(async (req, res) => {
  const { search, category } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

  const filter = { status: { $ne: 'suspended' } };
  if (isText(search)) filter.$text = { $search: search.trim() };
  if (isText(category)) filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, 'i');

  const [ngos, total] = await Promise.all([
    NGO.find(filter)
      .select('name description category logoUrl status createdAt')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NGO.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { ngos, page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getNgo = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id).populate('members.user', 'fullName').lean();
  if (!ngo || ngo.status === 'suspended') throw new AppError('NGO not found', 404);

  const mine = ngo.members.find((m) => String(m.user._id) === String(req.user._id));

  // Only members see who the other members are
  const members = mine
    ? ngo.members.map((m) => ({ userId: m.user._id, fullName: m.user.fullName, role: m.role }))
    : undefined;

  const { members: _omit, ...publicNgo } = ngo;
  res.json({
    success: true,
    data: { ngo: { ...publicNgo, memberCount: ngo.members.length, myRole: mine?.role || null, members } },
  });
});

export const updateNgo = asyncHandler(async (req, res) => {
  EDITABLE.forEach((f) => {
    if (typeof req.body[f] === 'string') req.ngo[f] = req.body[f];
  });
  await req.ngo.save();
  res.json({ success: true, data: { ngo: req.ngo } });
});

export const addMember = asyncHandler(async (req, res) => {
  const { email, role = 'member' } = req.body;
  if (!isText(email)) throw new AppError('email is required', 400);
  if (!['admin', 'member'].includes(role)) throw new AppError("role must be 'admin' or 'member'", 400);
  if (role === 'admin' && req.membership.role !== 'owner') {
    throw new AppError('Only the owner can add admins', 403);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.isActive) throw new AppError('No registered user with that email', 404);

  // Atomic: only adds if the user isn't already a member
  const result = await NGO.updateOne(
    { _id: req.ngo._id, 'members.user': { $ne: user._id } },
    { $push: { members: { user: user._id, role } } }
  );
  if (result.modifiedCount === 0) throw new AppError('That user is already a member', 409);

  res.status(201).json({
    success: true,
    data: { member: { userId: user._id, fullName: user.fullName, role } },
  });
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) throw new AppError("role must be 'admin' or 'member'", 400);

  const target = req.ngo.members.find((m) => String(m.user) === req.params.userId);
  if (!target) throw new AppError('Member not found', 404);
  if (target.role === 'owner') throw new AppError("The owner's role cannot be changed", 400);

  target.role = role;
  await req.ngo.save();
  res.json({ success: true, data: { member: { userId: target.user, role } } });
});

export const removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const isSelf = userId === String(req.user._id);

  const target = req.ngo.members.find((m) => String(m.user) === userId);
  if (!target) throw new AppError('Member not found', 404);
  if (target.role === 'owner') throw new AppError('The owner cannot be removed or leave the NGO', 400);

  if (!isSelf) {
    const me = req.membership.role;
    if (me === 'member') throw new AppError('You do not have permission to remove members', 403);
    if (me === 'admin' && target.role !== 'member') {
      throw new AppError('Admins can only remove regular members', 403);
    }
  }

  req.ngo.members = req.ngo.members.filter((m) => String(m.user) !== userId);
  await req.ngo.save();
  res.json({ success: true, message: isSelf ? 'You have left the NGO' : 'Member removed' });
});

// POST /ngos/:id/transfer-ownership   { userId }   (owner only)
export const transferOwnership = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) {
    throw new AppError("A valid userId is required", 400);
  }
  if (userId === String(req.user._id)) throw new AppError("You are already the owner", 400);

  const target = req.ngo.members.find((m) => String(m.user) === userId);
  if (!target) throw new AppError("That user is not a member of this NGO", 404);

  const newOwner = await User.findById(userId).select("isActive");
  if (!newOwner?.isActive) throw new AppError("That account is not active", 400);

  req.membership.role = "admin"; // the current owner steps down to admin
  target.role = "owner";
  await req.ngo.save();

  res.json({ success: true, message: "Ownership transferred", data: { newOwnerId: userId } });
});