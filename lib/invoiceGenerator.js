import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateInvoice = async (order) => {
  if (!order) throw new Error("Order object is required to generate invoice");

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontPath = path.join(
    __dirname,
    "../assets/fonts/Roboto/static/Roboto-Regular.ttf"
  );
  const fontBoldPath = path.join(
    __dirname,
    "../assets/fonts/Roboto/static/Roboto_Condensed-Bold.ttf"
  );

  const fontBytes = fs.readFileSync(fontPath);
  const fontBoldBytes = fs.readFileSync(fontBoldPath);

  const customFont = await pdfDoc.embedFont(fontBytes);
  const boldFont = await pdfDoc.embedFont(fontBoldBytes);

  const logoPath = path.join(__dirname, "../assets/khan_medicines_logo.png");
  const logoBuffer = fs.readFileSync(logoPath);
  const logoImage = await pdfDoc.embedPng(logoBuffer);

  const page = pdfDoc.addPage([620, 920]);
  const { height } = page.getSize();

  const margin = 30;
  let y = height - margin;

  const logoDims = logoImage.scale(0.18);
  page.drawImage(logoImage, {
    x: margin,
    y: y - 60,
    width: logoDims.width,
    height: logoDims.height,
  });
  page.drawText("Khan Medicines (Chemist and Druggist)", {
    x: 200,
    y: y - 30,
    size: 20,
    font: boldFont,
    color: rgb(0, 0.45, 0.2),
  });
  page.drawText("GSTIN: ", {
    x: 200,
    y: y - 50,
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText("Contact: +91 7006590688 | Email: hamidkhan.pharmacy@gmail.com", {
    x: 200,
    y: y - 65,
    size: 9,
    font: boldFont,
  });

  y -= 100;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 560, y },
    thickness: 1,
    color: rgb(0, 0.5, 0.3),
  });
  y -= 20;

  page.drawText(`Invoice #: ${order._id}`, {
    x: margin,
    y,
    size: 12,
    weight: "bold",
    font: boldFont,
  });
  page.drawText(`Order #: ${order.razorpayOrderId || order._id}`, {
    x: 400,
    y,
    size: 12,
    font: customFont,
  });

  y -= 15;
  page.drawText(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, {
    x: 400,
    y,
    size: 12,
    font: customFont,
  });
  if (order.couponApplied && order.couponApplied.code) {
    y -= 15;
    page.drawText(`Coupon: ${order.couponApplied.code}`, {
      x: 400,
      y,
      size: 12,
      font: customFont,
    });
  }
  y -= 20;
  if (order.customerName && order.customerName.trim()) {
    y -= 15;
    page.drawText(
      `Customer: ${order.customerName}`,
      { x: margin, y, size: 11, font: customFont }
    );
  }
  if (order.customerPhone) {
    y -= 15;
    page.drawText(`Phone: ${order.customerPhone}`, {
      x: margin,
      y,
      size: 11,
      font: customFont,
    });
  }

  const isOnlineOrder = !!order.razorpayOrderId || !!order.razorpayPaymentId;
  if (!isOnlineOrder) {
    y -= 15;
    page.drawText(`Salesperson: ${order.user?.fullName || "-"}`, {
      x: margin,
      y,
      size: 11,
      font: customFont,
    });
  }

  y -= 30;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 560, y },
    thickness: 0.8,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 25;

  const headers = ["#", "Item", "Qty", "Price", "Total"];
  const colWidths = [20, 280, 50, 80, 90];
  let x = margin;

  page.drawRectangle({
    x: margin - 5,
    y: y - 5,
    width: 520,
    height: 22,
    color: rgb(0.95, 0.95, 0.95),
    borderWidth: 0.5,
    borderColor: rgb(0.7, 0.7, 0.7),
  });

  headers.forEach((h, i) => {
    page.drawText(h, {
      x,
      y: y + 2,
      size: 11,
      font: customFont,
      color: rgb(0, 0.4, 0.2),
    });
    x += colWidths[i];
  });

  y -= 25;

  let index = 1;
  let subtotal = 0;

  for (const item of order.orderItems || []) {
    const name = item.product?.name || "Unknown Item";
    const qty = item.quantity || 1;
    const price = item.price || 0;
    const total = qty * price;
    subtotal += qty * price;

    x = margin;
    page.drawText(String(index++), { x, y, size: 10, font: customFont });
    x += colWidths[0];
    page.drawText(name.substring(0, 35), { x, y, size: 10, font: customFont });
    x += colWidths[1];
    page.drawText(String(qty), { x, y, size: 10, font: customFont });
    x += colWidths[2];
    page.drawText(`₹${price.toFixed(2)}`, { x, y, size: 10, font: customFont });
    x += colWidths[3];
    page.drawText(`₹${total.toFixed(2)}`, { x, y, size: 10, font: customFont });
    y -= 18;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 560, y },
    thickness: 0.8,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 25;

  let discount = 0;
  if (order.couponApplied && order.couponApplied.discountPercentage) {
    discount = subtotal * (order.couponApplied.discountPercentage / 100);
  }
  console.error("[INVOICE_DEBUG] orderId:", order._id, "subtotal:", subtotal, "discountPercentage:", order.couponApplied?.discountPercentage, "discount:", discount, "grandTotal:", subtotal - discount);
  const grandTotal = subtotal - discount;

  page.drawText(`Subtotal: ₹${subtotal.toFixed(2)}`, {
    x: 400,
    y,
    size: 11,
    font: customFont,
  });
  y -= 15;

  if (discount > 0) {
    console.error("[INVOICE_DEBUG] Drawing discount line:", order.couponApplied.discountPercentage + "%", "-₹" + discount.toFixed(2));
    page.drawText(
      `Discount (${order.couponApplied.discountPercentage}%): -₹${discount.toFixed(2)}`,
      {
        x: 400,
        y,
        size: 11,
        font: customFont,
        color: rgb(0.8, 0.2, 0.2),
      }
    );
    y -= 15;
  } else {
    console.error("[INVOICE_DEBUG] No discount drawn. discount:", discount, "couponApplied:", JSON.stringify(order.couponApplied));
  }

  page.drawText(`Grand Total: ₹${grandTotal.toFixed(2)}`, {
    x: 400,
    y,
    size: 13,
    font: customFont,
    color: rgb(0, 0.4, 0.2),
  });

  y -= 25;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 560, y },
    thickness: 0.8,
    color: rgb(0.5, 0.5, 0.5),
  });

  y -= 40;
  page.drawText("Khan Medicines (Chemist & Druggist)", {
    x: 40,
    y,
    size: 10,
    font: customFont,
  });
  y -= 30;
  page.drawText("Authorized Signature", {
    x: 40,
    y,
    size: 10,
    font: customFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 50;
  page.drawText("Thank you for shopping with us!", {
    x: 220,
    y,
    size: 12,
    font: customFont,
    color: rgb(0, 0.4, 0.2),
  });
  y -= 15;
  page.drawText("Visit again at khanmedicines.in", {
    x: 220,
    y,
    size: 10,
    font: customFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};
