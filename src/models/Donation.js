import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
      index: true,
    },

    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: [true, "The receiving NGO is required"],
      index: true,
    },

    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    donorName: {
      type: String,
      trim: true,
      default: "",
      maxlength: [150, "Donor name cannot exceed 150 characters"],
    },

    donorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      match: [
        /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Enter a valid donor email address",
      ],
    },

    amount: {
      type: Number,
      required: [true, "Donation amount is required"],
      min: [1, "Donation amount must be greater than zero"],
      validate: {
        validator: Number.isFinite,
        message: "Donation amount must be a valid number",
      },
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      enum: ["NGN", "USD", "GBP", "EUR"],
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "successful", "failed", "refunded"],
      default: "pending",
      index: true,
    },

    paymentProvider: {
      type: String,
      trim: true,
      default: "",
    },

    transactionReference: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },

    isAnonymous: {
      type: Boolean,
      default: false,
    },

    message: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Donation message cannot exceed 1000 characters"],
    },

    receiptUrl: {
      type: String,
      trim: true,
      default: "",
    },

    donatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

donationSchema.pre("validate", function () {
  if (this.isAnonymous) {
    this.donorName = "";
    this.donorEmail = "";
  }
});

const Donation = mongoose.model("Donation", donationSchema);

export default Donation;
