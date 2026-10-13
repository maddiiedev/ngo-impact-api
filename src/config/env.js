// src/config/env.js
import 'dotenv/config';

const env = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'].forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
});

export default env;