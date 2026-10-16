import NGO from "../models/NGO.js";
import Campaign from "../models/Campaign.js";
import Fundraiser from "../models/Fundraiser.js";
import Donation from "../models/Donation.js";
import Opportunity from "../models/Opportunity.js";
import Application from "../models/Application.js";
import Shift from "../models/Shift.js";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

const withSpotsLeft = (o) => ({ ...o, spotsLeft: Math.max(o.spots - o.acceptedCount, 0) });

export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();

  const [user, myNgos, suspendedIds] = await Promise.all([
    User.findById(userId).select("fullName email phoneNumber"),
    NGO.find({ "members.user": userId }).select("name status members").lean(),
    NGO.find({ status: "suspended" }).distinct("_id"),
  ]);

  const roleIn = (ngo) => ngo.members.find((m) => String(m.user) === String(userId)).role;

  // NGOs the user can manage (suspended NGOs can't be managed)
  const managedNgoIds = myNgos
    .filter((n) => n.status !== "suspended" && ["owner", "admin"].includes(roleIn(n)))
    .map((n) => n._id);

  // Everything the user can review, worked out once and reused below
  const [managedCampaignIds, managedFundraiserIds, managedOpportunityIds] = await Promise.all([
    Campaign.find({ ngo: { $in: managedNgoIds } }).distinct("_id"),
    Fundraiser.find({ $or: [{ createdBy: userId }, { ngo: { $in: managedNgoIds } }] }).distinct("_id"),
    Opportunity.find({ ngo: { $in: managedNgoIds } }).distinct("_id"),
  ]);

  const shiftPopulate = { path: "opportunity", select: "title ngo", populate: { path: "ngo", select: "name" } };

  const [
    myCampaigns,
    myFundraisers,
    fundraiserStats,
    recentDonations,
    donationTotals,
    pendingReviewCount,
    myOpportunities,
    pendingApplicationsCount,
    upcomingShifts,
    attendedTotals,
    applicationCounts,
    recentApplications,
    featuredCampaigns,
    trendingFundraisers,
    featuredOpportunities,
    newNgos,
  ] = await Promise.all([
    Campaign.find({ ngo: { $in: managedNgoIds } }).select("-__v").sort("-createdAt").limit(10).lean(),

    Fundraiser.find({ createdBy: userId }).select("-__v").sort("-createdAt").limit(10).lean(),

    // Real totals across ALL of the user's fundraisers, not just the 10 shown
    Fundraiser.aggregate([
      { $match: { createdBy: userId } },
      { $group: { _id: null, count: { $sum: 1 }, raised: { $sum: "$raisedAmount" } } },
    ]),

    // Recent donations in every status, so a donor also sees pending and rejected ones
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

    // Donations waiting for this user to confirm or reject (never their own)
    Donation.countDocuments({
      status: "pending",
      donor: { $ne: userId },
      $or: [{ campaign: { $in: managedCampaignIds } }, { fundraiser: { $in: managedFundraiserIds } }],
    }),

    // Opportunities of NGOs the user manages
    Opportunity.find({ ngo: { $in: managedNgoIds } })
      .select("title ngo status spots acceptedCount applicationDeadline createdAt")
      .populate("ngo", "name")
      .sort("-createdAt")
      .limit(10)
      .lean(),

    // Volunteer applications waiting for this user to review (never their own)
    Application.countDocuments({
      opportunity: { $in: managedOpportunityIds },
      status: "pending",
      volunteer: { $ne: userId },
    }),

    // The next shifts this user is signed up for
    Shift.find({
      signups: { $elemMatch: { user: userId, status: "signed_up" } },
      status: "scheduled",
      endTime: { $gt: now },
    })
      .select("title location startTime endTime opportunity")
      .populate(shiftPopulate)
      .sort("startTime")
      .limit(5)
      .lean(),

    // Hours and shifts the user has actually attended
    Shift.aggregate([
      { $match: { "signups.user": userId } },
      { $unwind: "$signups" },
      { $match: { "signups.user": userId, "signups.status": "attended" } },
      { $group: { _id: null, hours: { $sum: "$signups.hours" }, shifts: { $sum: 1 } } },
    ]),

    // The user's own applications, counted by status
    Application.aggregate([
      { $match: { volunteer: userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // The user's live applications (pending or accepted)
    Application.find({ volunteer: userId, status: { $in: ["pending", "accepted"] } })
      .select("status opportunity createdAt")
      .populate(shiftPopulate)
      .sort("-createdAt")
      .limit(5)
      .lean(),

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

    // Open opportunities that still have spots and accept applications
    Opportunity.find({
      status: "open",
      ngo: { $nin: suspendedIds },
      $or: [{ applicationDeadline: null }, { applicationDeadline: { $gt: now } }],
      $expr: { $lt: ["$acceptedCount", "$spots"] },
    })
      .select("title ngo category location isRemote spots acceptedCount applicationDeadline")
      .populate("ngo", "name logoUrl")
      .sort("-createdAt")
      .limit(6)
      .lean(),

    NGO.find({ status: "verified" })
      .select("name description category logoUrl")
      .sort("-createdAt")
      .limit(6)
      .lean(),
  ]);

  const counts = { pending: 0, accepted: 0, rejected: 0, withdrawn: 0 };
  applicationCounts.forEach((c) => {
    counts[c._id] = c.count;
  });

  const describeOpportunity = (o) =>
    o ? { id: o._id, title: o.title, ngo: o.ngo?.name || null } : null;

  res.json({
    success: true,
    data: {
      user,
      stats: {
        totalDonated: donationTotals[0]?.total || 0,
        donationsCount: donationTotals[0]?.count || 0,
        pendingReviewCount, // donations to confirm or reject
        pendingApplicationsCount, // volunteer applications to review
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
      myOpportunities: myOpportunities.map(withSpotsLeft),
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
      volunteering: {
        totalHours: Math.round((attendedTotals[0]?.hours || 0) * 100) / 100,
        attendedShifts: attendedTotals[0]?.shifts || 0,
        applicationCounts: counts,
        upcomingShifts: upcomingShifts.map((s) => ({
          id: s._id,
          title: s.title || null,
          location: s.location || null,
          startTime: s.startTime,
          endTime: s.endTime,
          opportunity: describeOpportunity(s.opportunity),
        })),
        recentApplications: recentApplications.map((a) => ({
          id: a._id,
          status: a.status,
          opportunity: describeOpportunity(a.opportunity),
          appliedAt: a.createdAt,
        })),
      },
      discover: {
        featuredCampaigns,
        trendingFundraisers,
        featuredOpportunities: featuredOpportunities.map(withSpotsLeft),
        newNgos,
      },
    },
  });
});