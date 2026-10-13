import mongoose from "mongoose";

const ngoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "NGO name is required"],
      trim: true,
      maxlength: [150, "NGO name cannot exceed 150 characters"],
    },

    description: {
      type: String,
      required: [true, "NGO description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },

    email: {
      type: String,
      required: [true, "NGO email is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"],
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    state: {
      type: String,
      trim: true,
      default: "",
    },

    registrationNumber: {
      type: String,
      trim: true,
      default: "",
    },

    website: {
      type: String,
      trim: true,
      default: "",
    },

    logoUrl: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "verified", "suspended"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

const NGO = mongoose.model("NGO", ngoSchema);

export default NGO;
