import env from '../config/env.js';

export const notFound = (req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' });

export const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyPattern || {})[0] || 'Field'} is already in use`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON in request body';
  }

  if (status === 500) console.error(err);
  if (status === 500 && env.nodeEnv === 'production') message = 'Internal server error';

  res.status(status).json({ success: false, message });
};