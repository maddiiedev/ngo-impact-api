// src/utils/receipts.js
import crypto from "node:crypto";
import AppError from "./AppError.js";
import cloudinary from "../config/cloudinary.js";

// Detect the real file type from its first bytes. The client-sent mimetype can be faked.
const SIGNATURES = [
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

const EXT_BY_MIME = Object.fromEntries(SIGNATURES.map((s) => [s.mime, s.ext]));

export const inspectReceipt = (buffer) => {
  const match = SIGNATURES.find((s) => s.bytes.every((b, i) => buffer[i] === b));
  if (!match) throw new AppError("Receipt must be a JPG, PNG or PDF file", 400);

  return {
    mime: match.mime,
    ext: match.ext,
    hash: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
};

// Uploads as an authenticated (private) asset and returns its public_id
export const saveReceipt = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "ngo-impact/receipts",
        public_id: crypto.randomUUID(),
        resource_type: "image", // Cloudinary stores JPG, PNG and PDF under "image"
        type: "authenticated", // no public URL exists for this file
        overwrite: false,
      },
      (err, result) => {
        if (err || !result) {
          console.error("Cloudinary upload failed:", err?.message || err);
          return reject(new AppError("Could not store the receipt. Please try again.", 502));
        }
        resolve(result.public_id);
      }
    );
    stream.end(buffer);
  });

// A download link that stops working after ttlSeconds
export const signedReceiptUrl = (publicId, mime, ttlSeconds = 300) => {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  const url = cloudinary.utils.private_download_url(publicId, EXT_BY_MIME[mime], {
    resource_type: "image",
    type: "authenticated",
    expires_at: expiresAt,
  });

  return { url, expiresAt: new Date(expiresAt * 1000).toISOString() };
};

export const deleteReceipt = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      type: "authenticated",
      invalidate: true,
    });
  } catch {
    // nothing more to do, the donation record is already gone
  }
};