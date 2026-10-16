import rateLimit from "express-rate-limit";

const minutes = (n) => n * 60 * 1000;

const make = ({ windowMs, limit, message, ...rest }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7", // RateLimit headers; Retry-After is added when blocked
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, message }),
    ...rest,
  });

// Custom keys never include the IP. Default keys (IP) are the only place the IP is used.
const hasEmail = (req) => typeof req.body?.email === "string" && req.body.email.trim() !== "";
const emailKey = (req) => req.body.email.toLowerCase().trim();
const byEmail = { keyGenerator: emailKey, skip: (req) => !hasEmail(req) };
const byUser = { keyGenerator: (req) => String(req.user._id), skip: (req) => !req.user };

const TRY_LATER = "Too many attempts. Please try again later.";

// Everything under /api, per IP. Generous because of shared IPs.
export const apiLimiter = make({
  windowMs: minutes(15),
  limit: 500,
  message: "Too many requests. Please slow down and try again shortly.",
});

export const registerLimiter = make({ windowMs: minutes(60), limit: 20, message: TRY_LATER });
export const refreshLimiter = make({ windowMs: minutes(15), limit: 60, message: TRY_LATER });

// Login: only failed attempts count, so a correct login never uses up the allowance
export const loginIpLimiter = make({
  windowMs: minutes(15), limit: 50, message: TRY_LATER, skipSuccessfulRequests: true,
});
export const loginEmailLimiter = make({
  windowMs: minutes(15), limit: 8, message: "Too many failed logins for this account. Try again in 15 minutes.",
  skipSuccessfulRequests: true, ...byEmail,
});

// Forgot password: counts every request, since the response is the same either way
export const forgotIpLimiter = make({ windowMs: minutes(60), limit: 10, message: TRY_LATER });
export const forgotEmailLimiter = make({
  windowMs: minutes(60), limit: 3, message: "Too many reset requests for this email. Try again in an hour.", ...byEmail,
});

// Reset password: this is where the 6-digit code gets guessed
export const resetIpLimiter = make({
  windowMs: minutes(60), limit: 20, message: TRY_LATER, skipSuccessfulRequests: true,
});
export const resetEmailLimiter = make({
  windowMs: minutes(15), limit: 5, message: "Too many incorrect codes. Try again in 15 minutes.",
  skipSuccessfulRequests: true, ...byEmail,
});

// Change password and deactivate: both check the current password. Per logged-in user.
export const accountSecurityLimiter = make({
  windowMs: minutes(15), limit: 5, message: TRY_LATER, skipSuccessfulRequests: true, ...byUser,
});

// Donation uploads cost bandwidth and storage. Per logged-in user, so it must run after protect.
export const donationUploadLimiter = make({
  windowMs: minutes(60), limit: 10, message: "You've submitted too many donations. Try again in an hour.", ...byUser,
});

export const applicationLimiter = make({
  windowMs: minutes(60), limit: 30, message: "You've sent too many applications. Try again later.", ...byUser,
});