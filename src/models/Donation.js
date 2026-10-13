import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
    fundraiser: { type: mongoose.Schema.Types.ObjectId, ref: "Fundraiser", default: null, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "NGN" },
    isAnonymous: { type: Boolean, default: false },
    message: { type: String, trim: true, maxlength: 500 },

    receiptUrl: { type: String, required: true }, // proof of payment the donor uploads
    status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending" },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true }
);

donationSchema.pre("validate", function () {
  if (!this.campaign === !this.fundraiser) {
    this.invalidate("campaign", "A donation must target exactly one of campaign or fundraiser");
  }
});

export default mongoose.model("Donation", donationSchema);