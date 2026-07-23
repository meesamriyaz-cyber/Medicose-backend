import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    orderItems: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 }
      }
    ],

    totalAmount: { type: Number, required: true, min: 0 },

    // Razorpay details (optional - local/direct orders won't have these)
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "refunded"],
      default: "pending"
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "card", "upi", "online", "wallet"],
      default: "cash"
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
        "returned"
      ],
      default: "pending"
    },

    deliveryDetails: {
      estimatedDelivery: { type: Date },
      actualDelivery: { type: Date },
      deliveryPartner: { type: String },
      trackingNumber: { type: String }
    },

    couponApplied: {
      code: String,
      discountPercentage: Number,
      discountAmount: Number
    },

    customerName: { type: String },
    customerPhone: { type: String }
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
