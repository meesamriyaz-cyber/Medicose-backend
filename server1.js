import express from "express";
import https from "https";
import fs from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

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

import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import connectDB from "./config/db.js";
import corsOptions from "./config/corsOptions.js";

dotenv.config({ path: path.resolve(__dirname, ".env.local"), quiet: true });

const app = express();

const PORT = process.env.PORT || 5000;
const shouldLogMobileTraffic = process.env.LOG_MOBILE_TRAFFIC === "true";
connectDB();
app.use(cors(corsOptions));

// Handle CORS preflight for all routes
app.options("/", (req, res) => {
  // Use the origin header, fall back to '*' if absent
  const origin = req.get("Origin") || "*";

  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );

  // If client requested specific headers, echo back allowed headers
  const reqHeaders = req.get("Access-Control-Request-Headers");
  if (reqHeaders) {
    res.header("Access-Control-Allow-Headers", reqHeaders);
  } else {
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
  }

  // success for preflight
  return res.status(204).send();
}); // IMPORTANT: Preflight support for all routes
app.use(cookieParser());

if (shouldLogMobileTraffic) {
  app.use((req, res, next) => {
    next();
  });
}

app.use(express.json({ limit: "10mb" }));

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

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// Handle React routing, return all requests to React app (except API routes)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, "localhost+1-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "localhost+1.pem")),
};

https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
});
