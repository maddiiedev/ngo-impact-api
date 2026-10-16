import mongoose from "mongoose";

const opportunitySchema = new mongoose.Schema(
  {
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: "NGO", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, trim: true },
    location: { type: String, trim: true },
    isRemote: { type: Boolean, default: false },
    skillsRequired: [{ type: String, trim: true, lowercase: true }],
    spots: { type: Number, required: true, min: 1 },
    acceptedCount: { type: Number, default: 0, min: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    applicationDeadline: { type: Date },
    status: { type: String, enum: ["draft", "open", "closed", "cancelled"], default: "draft", index: true },
  },
  { timestamps: true }
);

opportunitySchema.index({ title: "text", description: "text", category: "text" });

export default mongoose.model("Opportunity", opportunitySchema);