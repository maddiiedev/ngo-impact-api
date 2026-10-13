import mongoose from "mongoose";

const fundraiserSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    story: { type: String, required: true },
    category: { type: String, trim: true },
    coverImageUrl: { type: String },
    goalAmount: { type: Number, required: true, min: 1 },
    raisedAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN" },
    deadline: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: "NGO", default: null, index: true }, // null = personal
    status: { type: String, enum: ["draft", "active", "completed", "closed"], default: "active" },
  },
  { timestamps: true }
);

fundraiserSchema.index({ title: "text", story: "text", category: "text" });

export default mongoose.model("Fundraiser", fundraiserSchema);