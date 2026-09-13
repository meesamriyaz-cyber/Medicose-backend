import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });
dotenv.config({ quiet: true });

const LOCAL_MONGO_URI = "mongodb://127.0.0.1:27017/haleem_medicose";
const DESKTOP_MONGO_URI =
  process.env.DESKTOP_MONGO_URI ||
  "mongodb://127.0.0.1:27018/haleem_medicose";
const CLOUD_MONGO_URI =
  process.env.HALEEM_MEDICOSE_MONGO_URI ||
  process.env.MONGODB_URI ||
  null;

const isDesktop = process.env.DESKTOP_APP === "true";

const getPrimaryMongoURI = () => {
  if (isDesktop) return DESKTOP_MONGO_URI;
  return LOCAL_MONGO_URI;
};

const getFallbackMongoURI = (uri) => {
  if (!isDesktop && uri === LOCAL_MONGO_URI && CLOUD_MONGO_URI) {
    return CLOUD_MONGO_URI;
  }

  return null;
};

const connectDB = async (attempt = 1, uri = getPrimaryMongoURI()) => {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      family: 4,
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(
      `[DB] Connection failed (attempt ${attempt}, ${isDesktop ? "desktop" : "standard"} mode):`,
      error.message
    );

    const fallbackURI = getFallbackMongoURI(uri);
    if (fallbackURI) {
      return connectDB(1, fallbackURI);
    }

    if (attempt < 3) {
      const delay = Math.min(attempt * 3000, 15000);
      setTimeout(() => connectDB(attempt + 1, uri), delay);
    } else {
      console.error("[DB] All connection attempts failed. Please check your MongoDB setup.");
      process.exit(1);
    }
  }
};

export default connectDB;