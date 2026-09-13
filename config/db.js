import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(__dirname, "../.env.local"),
  quiet: true,
});

dotenv.config({ quiet: true });

const LOCAL_MONGO_URI = "mongodb://127.0.0.1:27017/haleem_medicose";

const mongoURI =
  process.env.DESKTOP_APP === "true"
    ? process.env.DESKTOP_MONGO_URI ||
      "mongodb://127.0.0.1:27018/haleem_medicose"
    : process.env.HALEEM_MEDICOSE_MONGO_URI ||
      process.env.MONGODB_URI ||
      LOCAL_MONGO_URI;

const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      family: 4,
    });

    console.log(
      `[DB] Connected successfully in ${
        process.env.DESKTOP_APP === "true" ? "desktop" : "standard"
      } mode`
    );
  } catch (error) {
    console.error("[DB] MongoDB connection error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
