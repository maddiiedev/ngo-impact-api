import NGO from "../models/NGO.js";
import Campaign from "../models/Campaign.js";
import Fundraiser from "../models/Fundraiser.js";
import Donation from "../models/Donation.js";
import User from "../models/User.js";

export const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("fullName email phoneNumber");

    const myNgos = await NGO.find({ "members.user": userId })
      .select("name status members")
      .lean();

    // NGOs where the user can manage campaigns
    const managedNgoIds = myNgos
      .filter((n) => n.members.some((m) => String(m.user) === String(userId) && ["owner", "admin"].includes(m.role)))
      .map((n) => n._id);

    const [myCampaigns, myFundraisers, recentDonations, donationTotals, featuredCampaigns, trendingFundraisers, newNgos] =
      await Promise.all([
        Campaign.find({ ngo: { $in: managedNgoIds } }).sort("-createdAt").limit(10).lean(),
        Fundraiser.find({ createdBy: userId }).sort("-createdAt").limit(10).lean(),
        Donation.find({ donor: userId, status: "successful" })
          .sort("-createdAt").limit(5)
          .populate("campaign", "title").populate("fundraiser", "title").lean(),
        Donation.aggregate([
          { $match: { donor: userId, status: "successful" } },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        Campaign.find({ status: "active" }).sort("-raisedAmount").limit(6).lean(),
        Fundraiser.find({ status: "active" }).sort("-createdAt").limit(6).lean(),
        NGO.find({ status: "verified" }).sort("-createdAt").limit(6).select("name description category logoUrl").lean(),
      ]);

    res.json({
      success: true,
      data: {
        user,
        stats: {
          totalDonated: donationTotals[0]?.total || 0,
          donationsCount: donationTotals[0]?.count || 0,
          ngosCount: myNgos.length,
          fundraisersCount: myFundraisers.length,
          totalRaisedByMyFundraisers: myFundraisers.reduce((sum, f) => sum + f.raisedAmount, 0),
        },
        myNgos: myNgos.map((n) => ({
          id: n._id,
          name: n.name,
          status: n.status,
          memberRole: n.members.find((m) => String(m.user) === String(userId)).role,
        })),
        myCampaigns,
        myFundraisers,
        recentDonations,
        discover: { featuredCampaigns, trendingFundraisers, newNgos },
      },
    });
  } catch (err) {
    next(err);
  }
};