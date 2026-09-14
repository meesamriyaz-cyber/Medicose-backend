import express from "express";
const router = express.Router();

import {
  getCoupon,
  validateCoupon,
  createCouponIfEligible,
  markAsUsed,
  reactivateCoupon,
} from "../controllers/couponController.js";
import { protectedRoute } from "../middleware/productMiddleware.js";

router.get("/", protectedRoute, getCoupon);
router.post("/validate", protectedRoute, validateCoupon);
router.post("/create-if-eligible", protectedRoute, createCouponIfEligible);
router.post("/mark-as-used", protectedRoute, markAsUsed);
router.post("/reactivate", protectedRoute, reactivateCoupon);

export default router;
