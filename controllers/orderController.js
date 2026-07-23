import Order from "../models/Order.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import { generateInvoice } from "../lib/invoiceGenerator.js"; // to be created

// GET /api/orders?status=processing&page=1&limit=10
export const listUserOrders = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { user: userId };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "fullName email")
        .populate("orderItems.product", "name price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      orders,
      pagination: {
        page: Number(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (err) {
    console.error("listUserOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/orders/:id
export const getOrderById = async (req, res) => {
  try {
    const userId = req.user?._id;
    const order = await Order.findOne({ _id: req.params.id, user: userId })
      .populate("user", "fullName email")
      .populate("orderItems.product", "fullName price description")
      .lean();

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    return res.json({ success: true, order });
  } catch (err) {
    console.error("getOrderById error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/orders/:id/invoice
export const downloadInvoice = async (req, res) => {
  try {
    const userId = req.user?._id;
    const order = await Order.findOne({ _id: req.params.id, user: userId })
      .populate("orderItems.product", "_id name price ,razorpayOrderId")
      .populate("user", "fullName email")
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    console.error("[INVOICE_DEBUG] downloadInvoice orderId:", req.params.id, "couponApplied type:", typeof order.couponApplied, "couponApplied:", JSON.stringify(order.couponApplied));

    const pdfBuffer = await generateInvoice(order);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice_${order.razorpayOrderId}.pdf"`,
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error("downloadInvoice error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate invoice" });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, status } = req.query;
    const limit = 10;
    const query = status ? { status } : {};
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("user", "fullName email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      orders,
      pagination: {
        total,
        totalPages: Math.ceil(total / limit),
        page: Number(page),
      },
    });
  } catch (err) {
    console.error("getAllOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
export const downloadInvoiceAdmin = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "fullName email")
      .populate("orderItems.product", "name price");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    console.error("[INVOICE_DEBUG] downloadInvoiceAdmin orderId:", req.params.id, "couponApplied type:", typeof order.couponApplied, "couponApplied:", JSON.stringify(order.couponApplied));

    const pdfBuffer = await generateInvoice(order);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice_${order._id}.pdf"`,
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error("downloadInvoiceAdmin error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate invoice" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentMethod, deliveryDetails } = req.body;
    const validStatuses = ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "completed", "cancelled", "returned"];

    if (!validStatuses.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const currentOrder = await Order.findById(id);
    if (!currentOrder)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    const previousStatus = currentOrder.status;

    const updateData = { status };
    if (paymentMethod) updateData.paymentMethod = paymentMethod;
    if (deliveryDetails) updateData.deliveryDetails = { ...currentOrder.deliveryDetails, ...deliveryDetails };

    const order = await Order.findByIdAndUpdate(id, updateData, { new: true });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (status === "cancelled" && previousStatus !== "cancelled") {
      for (const item of order.orderItems) {
        try {
          const updated = await Product.findByIdAndUpdate(
            item.product,
            { $inc: { stock: item.quantity } },
            { new: true, select: "name stock" }
          );
          if (!updated) {
            console.error(
              `[STOCK_RESTORE] Product ${item.product} not found for order ${order._id}`
            );
          }
        } catch (error) {
          console.error(
            `[STOCK_RESTORE] Failed to restore stock for product ${item.product} in order ${order._id}:`,
            error
          );
        }
      }
    }

    if (status === "delivered" && previousStatus !== "delivered") {
      order.deliveryDetails = order.deliveryDetails || {};
      order.deliveryDetails.actualDelivery = new Date();
      await order.save();
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("updateOrderStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
