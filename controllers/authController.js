import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import redis from "../lib/redis.js";
dotenv.config({ quiet: true });

const getAccessToken = (req) => {
  if (req.cookies?.access_token) return req.cookies.access_token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return null;
};

const getRefreshToken = (req) => {
  if (req.cookies?.refresh_token) return req.cookies.refresh_token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  if (req.body?.refresh_token) return req.body.refresh_token;

  return null;
};

const generateToken = async (userID) => {
  const access_token = jwt.sign(
    { userID: userID.toString() },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "30m",
    }
  );
  const refresh_token = jwt.sign(
    { userID: userID.toString() },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
  return { access_token, refresh_token };
};

const storeRefreshToken = async (userID, refreshToken) => {
  try {
    await redis.set(userID.toString(), refreshToken, "EX", 7 * 24 * 60 * 60); // 7 days
  } catch (error) {
    console.error("Error storing refresh token in Redis:", error);
    throw new Error("Unable to create authenticated session.");
  }
};

const setCookie = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    maxAge: 30 * 60 * 1000, // 30 minutes
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure:  isProd,
    sameSite: isProd ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};
export const signup = async (req, res) => {
  try {
    const { email, password, confirmPassword, fullName } = req.body;
    if (!email || !password || !confirmPassword || !fullName) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }
