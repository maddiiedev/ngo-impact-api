import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
  },
  { _id: false }
);

const ngoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, trim: true }, // e.g. education, health, environment
    email: { type: String, lowercase: true, trim: true },
    phoneNumber: { type: String, trim: true },
    address: { type: String, trim: true },
    logoUrl: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [memberSchema],
    status: { type: String, enum: ["verified", "suspended"], default: "verified", index: true },
  },
  { timestamps: true }
);

ngoSchema.index({ name: "text", description: "text", category: "text" }); // for search

export default mongoose.model("NGO", ngoSchema);