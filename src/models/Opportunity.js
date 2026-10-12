import mongoose from "mongoose";

const opportunitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Opportunity title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },

    description: {
      type: String,
      required: [true, "Opportunity description is required"],
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },

    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: [true, "The NGO responsible for this opportunity is required"],
      index: true,
    },

    requirements: {
      type: [String],
      default: [],
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    isRemote: {
      type: Boolean,
      default: false,
    },

    startDate: {
      type: Date,
      required: [true, "Opportunity start date is required"],
    },

    endDate: {
      type: Date,
      required: [true, "Opportunity end date is required"],
    },

    applicationDeadline: {
      type: Date,
      required: [true, "Application deadline is required"],
    },

    slots: {
      type: Number,
      required: [true, "Number of volunteer slots is required"],
      min: [1, "There must be at least one volunteer slot"],
      validate: {
        validator: Number.isInteger,
        message: "Volunteer slots must be a whole number",
      },
    },

    status: {
      type: String,
      enum: ["draft", "open", "closed", "cancelled", "completed"],
      default: "draft",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Opportunity creator is required"],
    },
  },
  {
    timestamps: true,
  },
);

opportunitySchema.pre("validate", function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate(
      "endDate",
      "Opportunity end date cannot be before its start date",
    );
  }

  if (
    this.applicationDeadline &&
    this.startDate &&
    this.applicationDeadline > this.startDate
  ) {
    this.invalidate(
      "applicationDeadline",
      "Application deadline cannot be after the opportunity start date",
    );
  }
});

const Opportunity = mongoose.model("Opportunity", opportunitySchema);

export default Opportunity;
