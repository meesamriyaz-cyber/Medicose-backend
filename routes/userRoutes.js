import express from "express";
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/userController.js";
import { protectedRoute, adminRoute } from "../middleware/productMiddleware.js";

const router = express.Router();

router.get("/", protectedRoute, adminRoute, getAllUsers);
router.post("/", protectedRoute, adminRoute, createUser);
router.put("/:id", protectedRoute, adminRoute, updateUser);
router.delete("/:id", protectedRoute, adminRoute, deleteUser);

export default router;
