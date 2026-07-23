import express from "express";
import https from "https";
import fs from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import mongoose from "mongoose";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import analyticsRoutes from "./routes/analyticsRoute.js";
import contactRoutes from "./routes/contactRoutes.js";
import prescriptionRoutes from "./routes/prescriptionRoute.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import saleRoutes from "./routes/saleRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import userRoutes from "./routes/userRoutes.js";

import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import connectDB from "./config/db.js";
import corsOptions from "./config/corsOptions.js";

dotenv.config({ path: path.resolve(__dirname, "./.env.local"), quiet: true });

const app = express();
const PORT = process.env.PORT || 5000;
const FORCE_HTTPS = process.env.FORCE_HTTPS === "true";
const NODE_ENV = process.env.NODE_ENV || "development";

const shouldLogMobileTraffic = process.env.LOG_MOBILE_TRAFFIC === "true";
connectDB();

// Drop old index if exists
mongoose.connection.once("open", async () => {
  try {
    const collection = mongoose.connection.db.collection("coupons");
    const indexes = await collection.indexes();
    const hasUserIDIndex = indexes.some((idx) => idx.name === "userID_1");
    if (hasUserIDIndex) {
      await collection.dropIndex("userID_1");
    }
  } catch (error) {
    console.error("Error dropping index:", error.message);
  }
});

app.use(cors(corsOptions));

app.use(cookieParser());

if (shouldLogMobileTraffic) {
  app.use((req, res, next) => {
    next();
  });
}

app.use(
  express.json({
    limit: "50mb", // Increased from 10mb to 50mb for mobile images
    timeout: 120000, // Increased from 30s to 120s (2 minutes) for mobile requests
  })
);

// Add request timeout middleware for mobile devices
app.use((req, res, next) => {
  // Set timeout based on request type - much longer for products with images
  const isProductRequest = req.path.startsWith("/api/products");
  const isMobile =
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      req.get("User-Agent") || ""
    );

  let timeout;
  if (isProductRequest) {
    // Product requests: 60s for mobile, 30s for desktop
    timeout = isMobile ? 60000 : 30000;
  } else {
    // Other requests: 45s
    timeout = 45000;
  }

  res.setTimeout(timeout, () => {
    res.status(408).json({
      error: "Request Timeout",
      message: `Request took too long to process${
        isMobile ? " on mobile" : ""
      }, please try again with a smaller image`,
      code: "MOBILE_TIMEOUT",
      device: isMobile ? "mobile" : "desktop",
      timeoutMs: timeout,
    });
  });
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/admin/users", userRoutes);

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// Handle React routing, return all requests to React app (except API routes)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

if (NODE_ENV === "development" && FORCE_HTTPS === "true") {
  const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, "localhost-key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "localhost.pem")),
  };

  https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
  });
} else {
  app.listen(PORT, "0.0.0.0", () => {
  });
}
