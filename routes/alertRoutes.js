import express from "express";
import {
  checkLowStock,
  checkExpiryAlerts,
  getLowStockProducts,
  getExpiringProducts
} from "../controllers/alertController.js";
import { protectedRoute, adminRoute } from "../middleware/productMiddleware.js";

const router = express.Router();

// Check low stock for a specific product (called after sale)
router.post("/check-low-stock/:productId", protectedRoute, async (req, res) => {
  try {
    await checkLowStock(req.params.productId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to check stock" });
  }
});

// Get all low stock products (admin)
router.get("/low-stock", protectedRoute, adminRoute, async (req, res) => {
  try {
    const products = await getLowStockProducts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all expiring products (admin)
router.get("/expiring", protectedRoute, adminRoute, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const products = await getExpiringProducts(days);
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Manually trigger expiry check (admin)
router.post("/check-expiry", protectedRoute, adminRoute, async (req, res) => {
  try {
    const products = await checkExpiryAlerts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
