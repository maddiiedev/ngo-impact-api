import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: "Opportunity", required: true },
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["pending", "accepted", "rejected", "withdrawn"], default: "pending", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

// One application per volunteer per opportunity
applicationSchema.index({ opportunity: 1, volunteer: 1 }, { unique: true });
applicationSchema.index({ volunteer: 1, createdAt: -1 });
applicationSchema.index({ opportunity: 1, status: 1 });

export default mongoose.model("Application", applicationSchema);