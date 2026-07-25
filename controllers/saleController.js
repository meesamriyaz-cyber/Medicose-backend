import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Coupon from "../models/Coupon.js";
import { generateInvoice } from "../lib/invoiceGenerator.js";

/**
 * POST /api/sales/create
 * Creates a direct store sale order without payment gateway.
 * Body: { orderItems: [{ product, quantity, price }], couponApplied: {...} }
 */
export const createDirectSale = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role;

    if (!userId || !userRole || userRole === "customer") {
      return res.status(403).json({ success: false, message: "Not authorized for direct sale" });
    }

    const { orderItems, couponApplied, customerName, customerPhone, directDiscountPercentage } = req.body;

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ success: false, message: "Order items are required" });
    }

    // Validate and compute totals server-side
    const validatedItems = [];
    let computedTotal = 0;
    let subtotal = 0;

    for (const item of orderItems) {
      const product = await Product.findById(item.product || item._id || item.id);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product not found: ${item.name || item.product}`
        });
      }

      const quantity = Number(item.quantity) || 1;
      const price = Number(item.price) || product.price;

      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${quantity}`,
          availableStock: product.stock
        });
      }

      validatedItems.push({
        product: product._id,
        quantity,
        price,
      });

      subtotal += price * quantity;
    }

    // Apply coupon discount if provided (server-validated)
    let discountAmount = 0;
    let validatedCoupon = null;
    if (couponApplied && couponApplied.code) {
      try {
        const found = await Coupon.findOne({
          code: couponApplied.code,
          
          userID: userId,
          expirationDate: { $gte: new Date() },
        });
        if (found) {
          validatedCoupon = found;
          discountAmount = subtotal * (found.discountPercentage / 100);
        }
      } catch (err) {
      }
    }

    if (!validatedCoupon && directDiscountPercentage && directDiscountPercentage > 0) {
      const clamped = Math.min(100, Math.max(0, Number(directDiscountPercentage)));
      discountAmount = subtotal * (clamped / 100);
    }

    computedTotal = subtotal - discountAmount;

    if (computedTotal <= 0) {
      return res.status(400).json({ success: false, message: "Invalid order total" });
    }

    // Create the order (use server-validated coupon values)
    const couponAppliedToSave = validatedCoupon
      ? {
          code: validatedCoupon.code,
          discountPercentage: validatedCoupon.discountPercentage,
          discountAmount,
        }
      : directDiscountPercentage
        ? {
            code: "DIRECT",
            discountPercentage: Number(directDiscountPercentage),
            discountAmount,
          }
        : undefined;

    console.error("[SALE_DEBUG] creating order with couponApplied:", JSON.stringify(couponAppliedToSave), "directDiscountPercentage:", directDiscountPercentage);

    const order = await Order.create({
      user: userId,
      orderItems: validatedItems,
      totalAmount: computedTotal,
      paymentStatus: "paid",
      status: "delivered",
      customerName: customerName || "",
      customerPhone: customerPhone || "",
      couponApplied: couponAppliedToSave,
    });

    // Decrease stock for each item (atomic $inc — no race condition)
    for (const item of validatedItems) {
      try {
        const updated = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true, select: "name stock" }
        );
        if (!updated) {
          // Product not found or insufficient stock
          const product = await Product.findById(item.product).select("name stock");
          if (!product) {
            console.error(`[SALE] Product ${item.product} not found during stock decrease (Order: ${order._id})`);
          } else {
            console.error(
              `[SALE] Insufficient stock for "${product.name}": have ${product.stock}, need ${item.quantity} (Order: ${order._id})`
            );
          }
        } else {
        }
      } catch (err) {
        console.error(`[SALE] Failed to update stock for product ${item.product}:`, err);
      }
    }

    // Mark coupon as used after successful sale
    if (validatedCoupon) {
      try {
        await Coupon.findByIdAndUpdate(validatedCoupon._id, { isActive: false });
      } catch (err) {
        console.error(`[SALE] Failed to mark coupon ${validatedCoupon.code} as used:`, err);
      }
    }

    // Check low stock alerts after sale
    for (const item of validatedItems) {
      try {
        const { checkLowStock } = await import("../controllers/alertController.js");
        await checkLowStock(item.product);
      } catch (err) {
        // Ignore alert errors
      }
    }

    // Clear user's cart
    if (userId) {
      await User.findByIdAndUpdate(userId, { $set: { cartItems: [] } });
    }

    // Return order with invoice PDF
    const populatedOrder = await Order.findById(order._id)
      .populate("orderItems.product", "name price")
      .populate("user", "fullName email")
      .lean();

    const pdfBuffer = await generateInvoice(populatedOrder);

    res.status(201).json({
      success: true,
      order: populatedOrder,
      invoiceBase64: pdfBuffer.toString("base64"),
      message: "Sale completed successfully",
    });
  } catch (err) {
    console.error("createDirectSale error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/sales/:id/invoice
 * Generates and returns invoice PDF for a completed order (accessible by admin/store)
 */
/**
 * GET /api/sales/report
 * Admin-only. Returns sales data grouped by day, month, or year with optional filters.
 * Query params:
 *   period   - "day" | "month" | "year" (default "day")
 *   date     - specific date string (YYYY-MM-DD). For day requires date, for month requires month+year, for year requires year
 *   month    - numeric month 1-12 (used when period=month)
 *   year     - numeric year (used when period=month or year)
 *   startDate - ISO date string, overrides date/month/year for custom range
 *   endDate   - ISO date string, paired with startDate
 *   payment  - "all" | "online" | "direct" (default "all")
 */
export const getSalesReport = async (req, res) => {
  try {
    const period = req.query.period || "day";
    const payment = req.query.payment || "all";
    let startDate, endDate;

    // Parse filter date range
    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate);
      endDate = new Date(req.query.endDate);
    } else {
      const now = new Date();
      switch (period) {
        case "day": {
          const d = req.query.date ? new Date(req.query.date) : now;
          startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
          break;
        }
        case "month": {
          const m = parseInt(req.query.month) || now.getMonth() + 1;
          const y = parseInt(req.query.year) || now.getFullYear();
          startDate = new Date(y, m - 1, 1);
          endDate = new Date(y, m, 1);
          break;
        }
        case "year": {
          const y = parseInt(req.query.year) || now.getFullYear();
          startDate = new Date(y, 0, 1);
          endDate = new Date(y + 1, 0, 1);
          break;
        }
        default:
          return res.status(400).json({ success: false, message: "Invalid period" });
      }
    }

    // Build match stage
    const match = { createdAt: { $gte: startDate, $lt: endDate } };

    // Payment filter: online orders have razorpayPaymentId set, direct orders don't
    if (payment === "online") {
      match.razorpayPaymentId = { $exists: true, $ne: null };
    } else if (payment === "direct") {
      match.razorpayPaymentId = { $exists: false };
    }

    // Group format based on period
    const dateFormat = period === "day" ? "%Y-%m-%d %H:00" : period === "month" ? "%Y-%m-%d" : "%Y";

    const salesData = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          discountAmount: { $sum: { $ifNull: ["$couponApplied.discountAmount", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Detailed order list for the period
    const orders = await Order.find(match)
      .populate("user", "fullName")
      .populate("orderItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

    // Compute summary
    const summary = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
      totalDiscount: orders.reduce(
        (sum, o) => sum + (o.couponApplied?.discountAmount || 0),
        0
      ),
      onlineOrders: orders.filter((o) => o.razorpayPaymentId).length,
      directOrders: orders.filter((o) => !o.razorpayPaymentId).length,
      onlineRevenue: orders
        .filter((o) => o.razorpayPaymentId)
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
      directRevenue: orders
        .filter((o) => !o.razorpayPaymentId)
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    };

    res.json({
      success: true,
      period,
      startDate,
      endDate,
      summary,
      aggregates: salesData,
      orders,
    });
  } catch (err) {
    console.error("getSalesReport error:", err);
    console.error("getSalesReport stack:", err.stack);
    res.status(500).json({ success: false, message: "Server error", detail: err.message });
  }
};

export const getSaleInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("orderItems.product", "name price")
      .populate("user", "fullName email")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const pdfBuffer = await generateInvoice(order);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice_${order._id}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error("getSaleInvoice error:", err);
    res.status(500).json({ success: false, message: "Failed to generate invoice" });
  }
};



