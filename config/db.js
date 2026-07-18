import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config();
const MONGO_URI =
  process.env.HALEEM_MEDICOSE_MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/haleem_medicose";
console.log("MongoDB URI from .env.local:", process.env.HALEEM_MEDICOSE_MONGO_URI);

const connectDB = async (attempt = 1) => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // 10 seconds for server selection
      socketTimeoutMS: 45000, // 45 seconds for socket timeout
      maxPoolSize: 10, // Maintain up to 10 socket connections
      connectTimeoutMS: 10000, // 10 seconds for initial connection
      family: 4, // Use IPv4
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(
      `MongoDB connection error (attempt ${attempt}):`,
      error.message
    );
    console.error(
      `Is a MongoDB server running at ${MONGO_URI}? Start one or set HALEEM_MEDICOSE_MONGO_URI.`
    );
    console.log("MongoDB URI from .env.local:", process.env.HALEEM_MEDICOSE_MONGO_URI);

    // Retry with backoff instead of crashing; gives local Mongo time to start.
    const delay = Math.min(attempt * 3000, 15000);
    setTimeout(() => connectDB(attempt + 1), delay);
  }
};

export default connectDB;
