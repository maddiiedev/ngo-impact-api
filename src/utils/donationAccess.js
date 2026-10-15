import NGO from "../models/NGO.js";
import Campaign from "../models/Campaign.js";
import Fundraiser from "../models/Fundraiser.js";

const managerQuery = (userId) => ({
  status: { $ne: "suspended" },
  members: { $elemMatch: { user: userId, role: { $in: ["owner", "admin"] } } },
});

export const getManagedNgoIds = (userId) => NGO.find(managerQuery(userId)).distinct("_id");

export const isNgoManager = async (ngoId, userId) =>
  !!(await NGO.exists({ _id: ngoId, ...managerQuery(userId) }));

// Can this user review (confirm or reject) this donation?
export const canReceive = async (donation, userId) => {
  if (donation.campaign) {
    const campaign = await Campaign.findById(donation.campaign).select("ngo").lean();
    return !!campaign && (await isNgoManager(campaign.ngo, userId));
  }

  const fundraiser = await Fundraiser.findById(donation.fundraiser).select("createdBy ngo").lean();
  if (!fundraiser) return false;
  if (String(fundraiser.createdBy) === String(userId)) return true;
  return !!fundraiser.ngo && (await isNgoManager(fundraiser.ngo, userId));
};