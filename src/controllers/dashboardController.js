// src/controllers/dashboardController.js
import NGO from "../models/NGO.js";
import Campaign from "../models/Campaign.js";
import Fundraiser from "../models/Fundraiser.js";
import Donation from "../models/Donation.js";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();

  const [user, myNgos, suspendedIds] = await Promise.all([
    User.findById(userId).select("fullName email phoneNumber"),
    NGO.find({ "members.user": userId }).select("name status members").lean(),
    NGO.find({ status: "suspended" }).distinct("_id"),
  ]);

  const roleIn = (ngo) => ngo.members.find((m) => String(m.user) === String(userId)).role;

  // NGOs where the user can manage campaigns (suspended NGOs can't be managed)
  const managedNgoIds = myNgos
    .filter((n) => n.status !== "suspended" && ["owner", "admin"].includes(roleIn(n)))
    .map((n) => n._id);

  const reviewableFilter = {
    status: "pending",
    donor: { $ne: userId }, // you can't confirm your own donation
  };

  const [
    myCampaigns,
    myFundraisers,
    fundraiserStats,
    recentDonations,
    donationTotals,
    pendingReviewCount,
    featuredCampaigns,
    trendingFundraisers,
    newNgos,
  ] = await Promise.all([
    Campaign.find({ ngo: { $in: managedNgoIds } })
      .select("-__v")
      .sort("-createdAt")
      .limit(10)
      .lean(),

    Fundraiser.find({ createdBy: userId }).select("-__v").sort("-createdAt").limit(10).lean(),

    // Real totals across ALL of the user's fundraisers, not just the 10 shown
    Fundraiser.aggregate([
      { $match: { createdBy: userId } },
      { $group: { _id: null, count: { $sum: 1 }, raised: { $sum: "$raisedAmount" } } },
    ]),

    // Recent donations in every status, so a donor sees pending and rejected ones too
    Donation.find({ donor: userId })
      .select("amount currency status campaign fundraiser createdAt rejectionReason")
      .sort("-createdAt")
      .limit(5)
      .populate("campaign", "title")
      .populate("fundraiser", "title")
      .lean(),

    // Totals count confirmed donations only
    Donation.aggregate([
      { $match: { donor: userId, status: "confirmed" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),

    // Donations waiting for this user to confirm or reject
    Promise.all([
      Campaign.find({ ngo: { $in: managedNgoIds } }).distinct("_id"),
      Fundraiser.find({ $or: [{ createdBy: userId }, { ngo: { $in: managedNgoIds } }] }).distinct("_id"),
    ]).then(([campaignIds, fundraiserIds]) =>
      Donation.countDocuments({
        ...reviewableFilter,
        $or: [{ campaign: { $in: campaignIds } }, { fundraiser: { $in: fundraiserIds } }],
      })
    ),

    // Discover: active, not ended, and not from suspended NGOs
    Campaign.find({
      status: "active",
      ngo: { $nin: suspendedIds },
      $or: [{ endDate: null }, { endDate: { $gt: now } }],
    })
      .select("title ngo category coverImageUrl goalAmount raisedAmount currency endDate")
      .populate("ngo", "name logoUrl")
      .sort("-raisedAmount")
      .limit(6)
      .lean(),

    Fundraiser.find({
      status: "active",
      ngo: { $nin: suspendedIds },
      $or: [{ deadline: null }, { deadline: { $gt: now } }],
    })
      .select("title category coverImageUrl goalAmount raisedAmount currency deadline")
      .sort("-createdAt")
      .limit(6)
      .lean(),

    NGO.find({ status: "verified" })
      .select("name description category logoUrl")
      .sort("-createdAt")
      .limit(6)
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      user,
      stats: {
        totalDonated: donationTotals[0]?.total || 0,
        donationsCount: donationTotals[0]?.count || 0,
        pendingReviewCount,
        ngosCount: myNgos.length,
        fundraisersCount: fundraiserStats[0]?.count || 0,
        totalRaisedByMyFundraisers: fundraiserStats[0]?.raised || 0,
      },
      myNgos: myNgos.map((n) => ({
        id: n._id,
        name: n.name,
        status: n.status,
        memberRole: roleIn(n),
      })),
      myCampaigns,
      myFundraisers,
      recentDonations: recentDonations.map((d) => ({
        id: d._id,
        amount: d.amount,
        currency: d.currency,
        status: d.status,
        rejectionReason: d.status === "rejected" ? d.rejectionReason : undefined,
        target: d.campaign
          ? { type: "campaign", id: d.campaign._id, title: d.campaign.title }
          : d.fundraiser
            ? { type: "fundraiser", id: d.fundraiser._id, title: d.fundraiser.title }
            : null,
        createdAt: d.createdAt,
      })),
      discover: { featuredCampaigns, trendingFundraisers, newNgos },
    },
  });
});