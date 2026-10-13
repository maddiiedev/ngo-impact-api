import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Campaign title is required"],
      trim: true,
      maxlength: [150, "Campaign title cannot exceed 150 characters"],
    },

    description: {
      type: String,
      required: [true, "Campaign description is required"],
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },

    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: [true, "The NGO responsible for this campaign is required"],
      index: true,
    },

    goalAmount: {
      type: Number,
      required: [true, "Fundraising goal is required"],
      min: [1, "Fundraising goal must be greater than zero"],
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      enum: ["NGN", "USD", "GBP", "EUR"],
    },

    startDate: {
      type: Date,
      required: [true, "Campaign start date is required"],
    },

    endDate: {
      type: Date,
      required: [true, "Campaign end date is required"],
    },

    status: {
      type: String,
      enum: ["draft", "active", "completed", "cancelled"],
      default: "draft",
      index: true,
    },

    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Campaign creator is required"],
    },
  },
  {
    timestamps: true,
  },
);

campaignSchema.pre("validate", function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate(
      "endDate",
      "Campaign end date cannot be before its start date",
    );
  }
});

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;
