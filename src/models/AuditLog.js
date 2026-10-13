import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    action: {
      type: String,
      required: [true, "Audit action is required"],
      trim: true,
      maxlength: [100, "Action cannot exceed 100 characters"],
    },

    entityType: {
      type: String,
      required: [true, "Entity type is required"],
      enum: [
        "User",
        "NGO",
        "Campaign",
        "Donation",
        "Opportunity",
        "Activity",
        "Application",
        "Shift",
        "Other",
      ],
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      trim: true,
      default: "",
    },

    userAgent: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
