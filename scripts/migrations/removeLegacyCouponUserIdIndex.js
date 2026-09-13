import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });
dotenv.config({ quiet: true });

const LOCAL_MONGO_URI = "mongodb://localhost:27017/haleem_medicose";
const MONGO_URI =
  process.env.HALEEM_MEDICOSE_MONGO_URI ||
  process.env.MONGODB_URI ||
  LOCAL_MONGO_URI;

const INDEX_NAME = "userID_1";
const COLLECTION_NAME = "coupons";

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      family: 4,
    });

    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    const indexes = await collection.indexes();
    const hasLegacyIndex = indexes.some((index) => index.name === INDEX_NAME);

    if (!hasLegacyIndex) {
      console.log(`[migration] Legacy index "${INDEX_NAME}" does not exist. No changes required.`);
      return;
    }

    await collection.dropIndex(INDEX_NAME);
    console.log(`[migration] Dropped legacy index "${INDEX_NAME}" from "${COLLECTION_NAME}".`);
  } finally {
    await mongoose.disconnect();
  }
}

migrate().catch((error) => {
  console.error("[migration] Failed to remove legacy coupon index:", error.message);
  process.exitCode = 1;
});
