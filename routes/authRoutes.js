import express from 'express';
import { signup, login, logout, refreshToken, getProfile, updateProfile } from '../controllers/authController.js';
import { protectedRoute } from '../middleware/productMiddleware.js';
const router = express.Router();

router.post('/signup', signup);  
router.post('/login', login);
router.post('/logout', logout);
router.get('/refresh-token', refreshToken); 
router.get('/getProfile', getProfile);  
router.put("/update-profile", protectedRoute, updateProfile);


export default router;