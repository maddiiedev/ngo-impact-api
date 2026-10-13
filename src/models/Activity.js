import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: [true, "The responsible NGO is required"],
      index: true,
    },

    title: {
      type: String,
      required: [true, "Activity title is required"],
      trim: true,
      maxlength: [150, "Activity title cannot exceed 150 characters"],
    },

    description: {
      type: String,
      required: [true, "Activity description is required"],
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },

    category: {
      type: String,
      required: [true, "Activity category is required"],
      enum: [
        "community-outreach",
        "education",
        "health",
        "environment",
        "food-distribution",
        "fundraising",
        "other",
      ],
    },

    date: {
      type: Date,
      required: [true, "Activity date is required"],
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    volunteersInvolved: {
      type: Number,
      default: 0,
      min: [0, "Volunteer count cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Volunteer count must be a whole number",
      },
    },

    beneficiariesReached: {
      type: Number,
      default: 0,
      min: [0, "Beneficiary count cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Beneficiary count must be a whole number",
      },
    },

    outcome: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Outcome cannot exceed 3000 characters"],
    },

    resourcesUsed: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Resources description cannot exceed 1000 characters"],
    },

    status: {
      type: String,
      enum: ["planned", "ongoing", "completed", "cancelled"],
      default: "planned",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Activity creator is required"],
    },
  },
  {
    timestamps: true,
  },
);

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;
