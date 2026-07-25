import { instance, getRazorpayKey } from "../lib/razorpay.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import PendingPayment from "../models/PendingPayment.js";

import crypto from "crypto";
import dotenv from "dotenv";

import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { createOrder } from "../lib/orderService.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

// ✅ Create Razorpay Order
export const createCheckoutSession = async (req, res) => {
  try {
    const { totalAmount, cartItems, couponCode } = req.body;

    if (!totalAmount || totalAmount <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid amount: must be greater than 0" });
    }

    const options = {
      amount: Math.round(totalAmount * 100), // convert rupees to paise for Razorpay
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`,
      payment_capture: 1,
      notes: {
        couponCode: couponCode || "",
        cart: JSON.stringify(cartItems),
      },
    };

    const order = await instance.orders.create(options);

    const userId = req.user && req.user._id;
    await PendingPayment.findOneAndUpdate(
      { razorpayOrderId: order.id },
      {
        user: userId || null,
        razorpayOrderId: order.id,
        cartSnapshot: cartItems || [],
        totalAmount,
        couponApplied: couponCode ? { code: couponCode } : null,
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour TTL
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({
      success: false,
      message: error?.error?.description || "Failed to create Razorpay order",
    });
  }
};

export const getPendingPayment = async (req, res) => {
  const { razorpayOrderId } = req.params;
  try {
    const pending = await PendingPayment.findOne({ razorpayOrderId });
    if (!pending)
      return res
        .status(404)
        .json({ success: false, message: "No pending payment found" });

    // Optionally restrict to owner:
    // if (pending.user && req.user && pending.user.toString() !== req.user._id.toString()) return res.status(403).json({ success:false });

    return res.status(200).json({ success: true, pending });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Verify Razorpay Payment
// --- paymentController.js ---
// (replace current verifyPayment export with the code below)

export const verifyPayment = async (req, res) => {
  try {
    const {
      payment_id,
      order_id,
      signature,
      orderItems,
      totalAmount,
      couponApplied,
      shippingAddress,
      customerName,
      customerPhone,
    } = req.body;

    if (!payment_id || !order_id || !signature) {
      return res.status(400).json({
        success: false,
        message: `Missing ${payment_id ? "" : "payment_id"}/${
          order_id ? "" : "order_id"
        }/${signature ? "" : "signature"}`,
      });
    }

    // re-verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET_TEST;
    if (!secret) {
      console.error("RAZORPAY_KEY_SECRET not found in environment");
      return res
        .status(500)
        .json({ success: false, message: "Server configuration error" });
    }
    const computed = crypto
      .createHmac("sha256", secret)
      .update(`${order_id}|${payment_id}`)
      .digest("hex");
    if (computed !== signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // fetch payment to confirm captured
    const payment = await instance.payments.fetch(payment_id);
    if (!payment || payment.status !== "captured") {
      return res
        .status(400)
        .json({ success: false, message: "Payment not captured" });
    }

    const userId = req.user && req.user._id;

    // if no shippingAddress and user has no saved addresses -> ask client to collect address
    if (!shippingAddress) {
      // check if user has addresses
      if (!userId) {
        // user not logged in — either ask to log in or collect guest shipping address
        return res.status(200).json({
          success: false,
          needs_address: true,
          message: "No user session / address. Please add your address.",
        });
      }

      const user = await User.findById(userId).select("addresses");
      const hasAddress =
        Array.isArray(user?.addresses) && user.addresses.length > 0;
      if (!hasAddress) {
        // create or update a PendingPayment entry for resume
        await PendingPayment.findOneAndUpdate(
          { razorpayOrderId: order_id },
          {
            user: userId,
            razorpayOrderId: order_id,
            razorpayPaymentId: payment_id,
            signature,
            cartSnapshot: orderItems || [],
            totalAmount,
            couponApplied: couponApplied || null,
            status: "pending",
            expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour TTL
          },
          { upsert: true, new: true }
        );
        return res.status(200).json({
          success: false,
          needs_address: true,
          message:
            "No address found. Please add an address before completing order.",
        });
      }
    }

    // If shippingAddress provided OR user has address - proceed to create order.
    // But verify whether order already exists for this payment
    let existing = await Order.findOne({ razorpayPaymentId: payment_id });
    if (existing) {
      return res.status(200).json({
        success: true,
        orderId: existing._id,
        message: "Order already created",
      });
    }

    // Choose shippingAddress: prefer provided shippingAddress, else user.primary address
    let finalShipping = shippingAddress;
    if (!finalShipping && userId) {
      const user = await User.findById(userId).select("addresses");
      finalShipping = (user.addresses && user.addresses[0]) || {};
    }

    // IMPORTANT: recompute totals server-side from product ids in orderItems.
    // For brevity, assume orderItems are validated and amount matches.
    const computedTotal = totalAmount; // replace with server recompute logic

    const normalizedItems = (orderItems || []).map((item) => ({
      product: item.product || item._id || item.id, // use whichever key exists
      quantity: item.quantity || 1,
      price: item.price || 0,
    }));

    const order = await Order.create({
      user: userId || null,
      orderItems: normalizedItems,
      totalAmount: computedTotal,
      razorpayOrderId: order_id,
      razorpayPaymentId: payment_id,
      razorpaySignature: signature,
      shippingAddress: finalShipping,
      customerName: customerName || "",
      customerPhone: customerPhone || "",
      couponApplied: couponApplied || null,
      paymentStatus: "paid",
      status: "processing",
    });

    // Update stock for each ordered item (atomic $inc — no race condition)
    for (const item of normalizedItems) {
      try {
        const updated = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true, select: "name stock" }
        );
        if (!updated) {
          const product = await Product.findById(item.product).select("name stock");
          if (!product) {
            console.error(
              `[STOCK_UPDATE] Product ${item.product} not found for order ${order._id}`
            );
          }
        } else {
        }
      } catch (error) {
        console.error(
          `[STOCK_UPDATE] Failed to update stock for product ${item.product} in order ${order._id}:`,
          error
        );
      }
    }

    // Mark pending as completed if exists
    await PendingPayment.findOneAndUpdate(
      { razorpayOrderId: order_id },
      { status: "completed" }
    );

    // Clear user's cart server-side
    if (userId) {
      await User.findByIdAndUpdate(userId, { $set: { cartItems: [] } });
    }
    return res.status(200).json({ success: true, orderId: order._id });
  } catch (err) {
    console.error("verifyPayment error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Send Razorpay Key
export const getKey = async (req, res) => {
  try {
    const key = getRazorpayKey();
    res.status(200).json({ key });
  } catch (error) {
    console.error("Error fetching Razorpay key:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

async function createNewCoupon(userId) {
  await Coupon.findOneAndDelete({ userId });

  const newCoupon = new Coupon({
    code: "GIFT" + Math.random().toString(36).substring(2, 8).toUpperCase(),
    discountPercentage: 10,
    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    userId: userId,
  });

  await newCoupon.save();

  return newCoupon;
}


