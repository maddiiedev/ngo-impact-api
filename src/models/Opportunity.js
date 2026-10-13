
import mongoose from "mongoose";

const opportunitySchema = new mongoose.Schema(
  {
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: "NGO", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    skillsRequired: [{ type: String, trim: true, lowercase: true }],
    location: { type: String, trim: true },
    isRemote: { type: Boolean, default: false },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ["open", "closed", "cancelled"], default: "open" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Opportunity", opportunitySchema);