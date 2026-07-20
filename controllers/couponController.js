import Coupon from "../models/Coupon.js";
export const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({
      userID: req.user._id,
      isActive: true,
    });
    res.json(coupon || null);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const createCouponIfEligible = async (req, res) => {
  try {
    const { subtotal } = req.body;
    if (subtotal < 500) {
      return res.json({ message: "Not eligible for coupon" });
    }

    const existingCoupon = await Coupon.findOne({
      userID: req.user._id,
      isActive: true,
    });

    if (existingCoupon) {
      return res.json({ message: "Already has active coupon" });
    }

    const newCoupon = new Coupon({
      code: "GIFT" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      discountPercentage: 10,
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userID: req.user._id,
    });

    await newCoupon.save();
    res.json({ coupon: newCoupon, message: "Coupon created" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const markAsUsed = async (req, res) => {
  try {
    const { code } = req.body;
    const coupon = await Coupon.findOneAndUpdate(
      { code, userID: req.user._id, isActive: true },
      { isActive: false },
      { new: true }
    );

    if (!coupon) {
      return res
        .status(404)
        .json({ message: "Coupon not found or already used" });
    }

    res.json({ message: "Coupon marked as used" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const coupon = await Coupon.findOne({
      code: code,
      userID: req.user._id,
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    if (coupon.expirationDate < new Date()) {
      coupon.isActive = false;
      await coupon.save();
      return res.status(404).json({ message: "Coupon expired" });
    }

    coupon.isActive = false;
    await coupon.save();

    res.json({
      message: "Coupon is valid",
      code: coupon.code,
      discountPercentage: coupon.discountPercentage,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const reactivateCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const coupon = await Coupon.findOneAndUpdate(
      { code, userID: req.user._id, isActive: false },
      { isActive: true },
      { new: true }
    );

    if (!coupon) {
      return res
        .status(404)
        .json({ message: "Coupon not found or already active" });
    }

    res.json({ coupon });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
