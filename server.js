import app from './src/app.js';
import env from './src/config/env.js';
import connectDB from './src/config/db.js';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const start = async () => {
  await connectDB(env.mongodbUri);
  app.listen(env.port, () => {
    console.log(`NGO Impact API is running on port ${env.port}`);
  });
};

start();