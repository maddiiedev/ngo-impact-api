import mongoose from "mongoose";

const signupSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["signed_up", "attended", "absent"], default: "signed_up" },
    hours: { type: Number, default: 0, min: 0 },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema(
  {
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: "Opportunity", required: true, index: true },
    title: { type: String, trim: true },
    location: { type: String, trim: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    capacity: { type: Number, required: true, min: 1 },
    signups: [signupSchema],
    status: { type: String, enum: ["scheduled", "completed", "cancelled"], default: "scheduled", index: true },
  },
  { timestamps: true }
);

shiftSchema.index({ "signups.user": 1, startTime: 1 });

shiftSchema.pre("validate", function () {
  if (this.endTime <= this.startTime) this.invalidate("endTime", "endTime must be after startTime");
});

export default mongoose.model("Shift", shiftSchema);