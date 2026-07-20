import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";
dotenv.config({ quiet: true });
export const protectedRoute = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.cookies?.access_token;

    if (!accessToken) {
      return res.status(401).json({ message: "No access token provided" });
    }
    try {
      if (!process.env.JWT_ACCESS_SECRET) {
        return res.status(500).json({ message: "Server configuration error" });
      }
      const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);

      // Ensure userID is a valid ObjectId format
      if (!decoded.userID || !decoded.userID.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(401).json({ message: "Invalid user ID in token" });
      }

      const user = await User.findById(decoded.userID).select("-password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  } catch (error) {
    console.error("Error in protected route middleware:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
export const adminRoute = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Access Denied, Admin Only" });
};
