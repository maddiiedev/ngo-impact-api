import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import env from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Render puts one proxy in front of the app. Without this, every user appears
// to come from the proxy's IP and the global limit would block everyone together.
if (env.nodeEnv === 'production') app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check, outside the limiter so Render's pings never count
app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'NGO Impact API is running' });
});

app.use('/api', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

export default app;