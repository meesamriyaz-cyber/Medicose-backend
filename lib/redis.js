import Redis from "ioredis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const isDesktopApp = process.env.DESKTOP_APP === "true";
const redisUrl = process.env.UPSTASH_URL || process.env.REDIS_URL;

const createDesktopSessionStore = () => {
  const sessions = new Map();

  const purgeExpired = (key) => {
    const entry = sessions.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      sessions.delete(key);
      return null;
    }

    return entry.value;
  };

  return {
    async get(key) {
      return purgeExpired(key);
    },

    async set(key, value, mode, ttlSeconds) {
      if (mode !== "EX" || !Number.isFinite(Number(ttlSeconds))) {
        throw new Error("Desktop session store requires Redis-style EX TTL arguments.");
      }

      sessions.set(key, {
        value,
        expiresAt: Date.now() + Number(ttlSeconds) * 1000,
      });

      return "OK";
    },

    async del(key) {
      return sessions.delete(key) ? 1 : 0;
    },

    on() {},
  };
};

let redis;

if (isDesktopApp) {
  redis = createDesktopSessionStore();
  console.log("Redis: using local in-memory session store for desktop mode.");
} else {
  if (!redisUrl) {
    throw new Error(
      "Redis configuration is missing. Set UPSTASH_URL or REDIS_URL before starting the backend."
    );
  }

  redis = new Redis(redisUrl, {
    tls: {},
    maxRetriesPerRequest: 2,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetries: 3,
    retryDelayOnClusterDown: 300,
    connectTimeout: 5000,
    commandTimeout: 3000,
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err.message);
  });
}

export default redis;
