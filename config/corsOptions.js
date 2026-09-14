const defaultAllowedOrigins = [
  "http://localhost",
  "https://localhost",
  "http://localhost:5173",
  "https://localhost:5173",
  "http://localhost:5174",
  "https://localhost:5174",
  "http://localhost:5175",
  "https://localhost:5175",
  "http://10.0.2.2",
  "https://10.0.2.2",
  "http://10.0.2.2:5173",
  "https://10.0.2.2:5173",
  "capacitor://localhost",
  "ionic://localhost",
];

const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...envAllowedOrigins,
]);

const isDevelopment = process.env.NODE_ENV !== "production";

const isPrivateLanOrigin = (origin) =>
  /^https?:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}):\d+$/i.test(
    origin
  );

const corsOptions = {
  origin: (origin, callback) => {
    // Non-browser clients and packaged Electron/file contexts may not send Origin.
    if (!origin || origin === "null") {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    // Preserve local LAN development without allowing arbitrary internet origins.
    if (isDevelopment && isPrivateLanOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

export default corsOptions;
