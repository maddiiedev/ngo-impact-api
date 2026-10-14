import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: "NGO", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, trim: true },
    coverImageUrl: { type: String },
    goalAmount: { type: Number, required: true, min: 1 },
    raisedAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN" },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ["draft", "active", "completed", "cancelled"], default: "draft" },
  },
  { timestamps: true }
);

campaignSchema.index({ title: "text", description: "text", category: "text" });

export default mongoose.model("Campaign", campaignSchema);