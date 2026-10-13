import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, sha256 } from '../utils/tokens.js';

const publicUser = (u) => ({
  id: u._id,
  fullName: u.fullName,
  email: u.email,
  phoneNumber: u.phoneNumber,
  createdAt: u.createdAt,
});

// Creates a new token pair and stores the refresh token's hash
const issueTokens = async (user) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  user.refreshTokenHash = sha256(refreshToken);
  await user.save();
  return { accessToken, refreshToken };
};

export const register = asyncHandler(async (req, res) => {
  const { fullName, email, phoneNumber, password } = req.body;

  if ([fullName, email, phoneNumber, password].some((v) => typeof v !== 'string' || !v.trim())) {
    throw new AppError('fullName, email, phoneNumber and password are required', 400);
  }
  if (password.length < 8) throw new AppError('Password must be at least 8 characters', 400);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ fullName, email, phoneNumber, passwordHash });
  const tokens = await issueTokens(user);

  res.status(201).json({ success: true, data: { user: publicUser(user), ...tokens } });
});

//for the login endpoint
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError('Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) throw new AppError('Invalid email or password', 401);
  if (!user.isActive) throw new AppError('This account has been deactivated', 403);

  const tokens = await issueTokens(user);
  res.json({ success: true, data: { user: publicUser(user), ...tokens } });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (typeof refreshToken !== 'string') throw new AppError('Refresh token is required', 400);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.refreshTokenHash !== sha256(refreshToken)) {
    // A token that verifies but doesn't match the stored one was already used: treat as theft
    if (user) {
      user.refreshTokenHash = null;
      await user.save();
    }
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const tokens = await issueTokens(user);
  res.json({ success: true, data: tokens });
});

export const logout = asyncHandler(async (req, res) => {
  req.user.refreshTokenHash = null;
  await req.user.save();
  res.json({ success: true, message: 'Logged out' });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: publicUser(req.user) } });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (typeof email !== 'string') throw new AppError('Email is required', 400);

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (user && user.isActive) {
    const code = String(crypto.randomInt(100000, 1000000)); // 6 digits
    user.resetPasswordCodeHash = sha256(code);
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // TODO: send by email (e.g. nodemailer). For now, it prints in the terminal in dev only.
    if (env.nodeEnv !== 'production') console.log(`Password reset code for ${user.email}: ${code}`);
  }

  // Same response whether or not the email exists, so nobody can probe for registered emails
  res.json({ success: true, message: 'If that email is registered, a reset code has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body;
  if ([email, code, newPassword].some((v) => typeof v !== 'string')) {
    throw new AppError('email, code and newPassword are required', 400);
  }
  if (newPassword.length < 8) throw new AppError('Password must be at least 8 characters', 400);

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    resetPasswordExpires: { $gt: new Date() },
  });
  if (!user || user.resetPasswordCodeHash !== sha256(code)) {
    throw new AppError('Invalid or expired reset code', 400);
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.resetPasswordCodeHash = null;
  user.resetPasswordExpires = null;
  user.refreshTokenHash = null;
  await user.save();

  res.json({ success: true, message: 'Password reset successful. Please log in.' });
});