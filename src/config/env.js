
import 'dotenv/config';

const env = {
  port: process.env.PORT || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV || 'development',
};

['MONGODB_URI', 'JWT_SECRET'].forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
});

export default env;
