import express from "express";
import {
  getAllProducts,
  getProductById,
  deleteProduct,
  setFeaturedProduct,
  getProductsByCategory,
  getRecommendedProducts,
  getFeaturedProducts,
  decreaseStock,
} from "../controllers/productController.js";
import {
  addProductWithStableImages,
  updateProductWithStableImages,
} from "../controllers/productImageController.js";
import { protectedRoute, adminRoute } from "../middleware/productMiddleware.js";
const router = express.Router();
router.get("/", getAllProducts);
router.get("/featured", getFeaturedProducts);
router.get("/category/:category", getProductsByCategory);
router.get("/recommendations", getRecommendedProducts);
router.post("/addproduct", addProductWithStableImages);
router.get("/:id", getProductById);
router.put("/:id", updateProductWithStableImages);
router.put("/:id/decrease-stock", decreaseStock);
router.patch("/:id", protectedRoute, adminRoute, setFeaturedProduct);
router.delete("/:id", deleteProduct);
export default router;
