// src/utils/validators.js
import AppError from "./AppError.js";

export const ALLOWED_CURRENCIES = ["NGN", "USD"];

export const isText = (value) => typeof value === "string" && value.trim().length > 0;

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const validateGoal = (value) => {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 1) {
    throw new AppError("goalAmount must be a number greater than or equal to 1", 400);
  }
  return amount;
};

export const parseCurrency = (value) => {
  if (typeof value !== "string") throw new AppError("currency must be a string", 400);

  const currency = value.trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.includes(currency)) {
    throw new AppError(`currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`, 400);
  }
  return currency;
};

export const parseImageUrl = (value) => {
  if (typeof value !== "string") throw new AppError("coverImageUrl must be a string", 400);

  const url = value.trim();
  if (url === "") return ""; // allows clearing the image

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("coverImageUrl must be a valid URL", 400);
  }
  if (parsed.protocol !== "https:") throw new AppError("coverImageUrl must start with https://", 400);
  return url;
};

// Returns a Date, or null when the value is null or an empty string
export const parseDate = (value, label) => {
  if (value === null || value === "") return null;

  if (typeof value !== "string" && typeof value !== "number") {
    throw new AppError(`${label} must be a valid date`, 400);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${label} must be a valid date`, 400);
  return date;
};