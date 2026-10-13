import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env.js';

export const signAccessToken = (userId) =>
  jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const signRefreshToken = (userId) =>
  jwt.sign({ sub: String(userId) }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
    jwtid: crypto.randomUUID(), // makes every refresh token unique
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwtRefreshSecret);

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');