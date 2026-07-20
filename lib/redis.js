import Redis from "ioredis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const redisUrl = process.env.UPSTASH_URL || process.env.REDIS_URL;

let redis;

if (redisUrl) {
  redis = new Redis(redisUrl, {
    tls: {},
    maxRetriesPerRequest: 2,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetries: 3,
    retryDelayOnClusterDown: 300,
    connectTimeout: 5000, // 5 seconds
    commandTimeout: 3000, // 3 seconds
  });
} else {
  redis = {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
    on: () => {},
  };
}

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

export default redis;
