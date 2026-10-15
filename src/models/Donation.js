import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
    },
    fundraiser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fundraiser",
      default: null,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    isAnonymous: { type: Boolean, default: false },
    message: { type: String, trim: true, maxlength: 500 },

    receiptPublicId: { type: String, required: true }, // Cloudinary id, never sent to clients
    receiptMimeType: { type: String, required: true },
    receiptHash: { type: String, required: true, index: true }, // sha256, blocks reusing one receipt

    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

donationSchema.index({ campaign: 1, status: 1 });
donationSchema.index({ fundraiser: 1, status: 1 });

donationSchema.pre("validate", function () {
  if (!this.campaign === !this.fundraiser) {
    this.invalidate(
      "campaign",
      "A donation must target exactly one of campaign or fundraiser",
    );
  }
});

export default mongoose.model("Donation", donationSchema);
