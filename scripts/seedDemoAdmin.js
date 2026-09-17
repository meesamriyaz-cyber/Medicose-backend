import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(__dirname, "../.env.local"),
  quiet: true,
});
dotenv.config({ quiet: true });

const email = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.DEMO_ADMIN_PASSWORD;
const fullName = process.env.DEMO_ADMIN_NAME?.trim() || "Medicose Demo Admin";
const mongoURI = process.env.DESKTOP_APP === "true"
  ? "mongodb://127.0.0.1:27018/haleem_medicose"
  : process.env.HALEEM_MEDICOSE_MONGO_URI;

if (!email || !password) {
  console.error("Demo admin setup requires DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("DEMO_ADMIN_PASSWORD must be at least 12 characters long.");
  process.exit(1);
}

if (!mongoURI) {
  console.error("Demo admin setup requires HALEEM_MEDICOSE_MONGO_URI.");
  process.exit(1);
}

try {
  await mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    family: 4,
  });

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    if (existingUser.role !== "admin") {
      console.error(
        `A user already exists for ${email} with role '${existingUser.role}'. No changes were made.`
      );
      process.exitCode = 1;
    } else {
      console.log(`Demo admin already exists: ${email}`);
    }
  } else {
    const admin = new User({
      email,
      password,
      confirmPassword: password,
      fullName,
      role: "admin",
    });

    await admin.save();
    console.log(`Demo admin created successfully: ${email}`);
  }
} catch (error) {
  console.error("Demo admin setup failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
