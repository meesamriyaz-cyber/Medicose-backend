import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === "production";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fromAddress = process.env.SMTP_FROM || "Khan Medicines <no-reply@khanmedicines.in>";

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });
    return info;
  } catch (error) {
    console.error("Email send error:", error);
    throw error;
  }
};

export const sendOrderConfirmation = async (order) => {
  const customerEmail = order.user?.email;
  if (!customerEmail) return;

  const subject = `Order Confirmed - ${order._id}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #008080;">Order Confirmed</h2>
      <p>Dear ${order.customerName || "Customer"},</p>
      <p>Your order has been confirmed successfully.</p>
      <p><strong>Order ID:</strong> ${order._id}</p>
      <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
      <p><strong>Payment Method:</strong> ${order.paymentMethod || "cash"}</p>
      <p><strong>Status:</strong> ${order.status}</p>
      <p>Thank you for shopping with Khan Medicines!</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, html });
};

export const sendPrescriptionStatusUpdate = async (prescription, user) => {
  const customerEmail = user?.email;
  if (!customerEmail) return;

  const subject = `Prescription ${prescription.status === "approved" ? "Approved" : "Rejected"} - ${prescription._id}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #008080;">Prescription ${prescription.status === "approved" ? "Approved" : "Rejected"}</h2>
      <p>Dear ${user.fullName || "Customer"},</p>
      <p>Your prescription has been <strong>${prescription.status}</strong>.</p>
      <p><strong>Prescription ID:</strong> ${prescription._id}</p>
      ${prescription.notes ? `<p><strong>Notes:</strong> ${prescription.notes}</p>` : ""}
      <p>Please visit the store or contact us for further details.</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, html });
};

export const sendLowStockAlert = async (product) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const subject = `Low Stock Alert - ${product.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e74c3c;">Low Stock Alert</h2>
      <p>The following product is running low on stock:</p>
      <p><strong>Product:</strong> ${product.name}</p>
      <p><strong>Current Stock:</strong> ${product.stock}</p>
      <p><strong>Min Stock Level:</strong> ${product.minStockLevel}</p>
      <p><strong>Category:</strong> ${product.category}</p>
      <p>Please restock immediately.</p>
    </div>
  `;

  return sendEmail({ to: adminEmail, subject, html });
};

export const sendExpiryAlert = async (product) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const subject = `Expiry Alert - ${product.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e74c3c;">Expiry Alert</h2>
      <p>The following product is expiring soon:</p>
      <p><strong>Product:</strong> ${product.name}</p>
      <p><strong>Expiry Date:</strong> ${product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : "N/A"}</p>
      <p><strong>Batch Number:</strong> ${product.batchNumber || "N/A"}</p>
      <p><strong>Current Stock:</strong> ${product.stock}</p>
      <p>Please take necessary action.</p>
    </div>
  `;

  return sendEmail({ to: adminEmail, subject, html });
};
