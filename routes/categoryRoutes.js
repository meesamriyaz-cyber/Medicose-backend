import express from "express";
import {
  getAllCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";
import { protectedRoute, adminRoute } from "../middleware/productMiddleware.js";

const router = express.Router();

router.get("/", getAllCategories);
router.post("/add", protectedRoute, adminRoute, addCategory);
router.put("/:id", protectedRoute, adminRoute, updateCategory);
router.delete("/:id", protectedRoute, adminRoute, deleteCategory);

export default router;
