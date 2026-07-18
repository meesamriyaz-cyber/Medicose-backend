import express from "express";
import { protectedRoute, adminRoute } from "../middleware/productMiddleware.js";
import { createDirectSale, getSaleInvoice, getSalesReport } from "../controllers/saleController.js";

const router = express.Router();

// Create a direct store sale (no payment gateway)
router.post("/create", protectedRoute, createDirectSale);

// Sales report (admin only)
router.get("/report", protectedRoute, adminRoute, getSalesReport);

// Get invoice for a completed sale
router.get("/:id/invoice", protectedRoute, getSaleInvoice);

export default router;
