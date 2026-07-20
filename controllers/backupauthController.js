import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import redis from "../lib/redis.js";
import { set } from "mongoose";
dotenv.config({ quiet: true });

const generateToken = async (userID) => {
    const access_token = jwt.sign({ userID: userID.toString() }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '5m'
    })
    const refresh_token = jwt.sign({ userID: userID.toString() }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: '7d'
    })
   return { access_token, refresh_token };
}

const storeRefreshToken = async (userID, refreshToken) => {
    try {
        await redis.set(userID.toString(), refreshToken, 'EX', 7 * 24 * 60 * 60); // 7 days
    } catch (error) {
        console.error("Error storing refresh token in Redis:", error);
    }
}

const setCookie = (res, accessToken, refreshToken) => {
      const isProd = process.env.NODE_ENV === 'production';

    res.cookie('access_token', accessToken, {
        httpOnly: true,     
        secure: process.env.NODE_ENV === 'production',
        sameSite:  isProd ? 'None' : 'Strict',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,     
        secure: process.env.NODE_ENV === 'production',
        sameSite: isProd ? 'None' : 'Strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
}
export const signup = async (req, res) => {
 
  try {
   const { email, password , confirmPassword, fullName, role} = req.body;
   if(!email || !password || !confirmPassword || !fullName) {
    return res.status(400).json({ message: "Please provide all required fields" });
   }
    if(password !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
    }

     if(password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

     const user = await User.findOne({ email });
   if(user) {
    return res.status(400).json({ message: "User already exists" });
   }
    const newUser = new User({ email, password, confirmPassword, fullName, role });
    await newUser.save();
    const {access_token, refresh_token} = await generateToken(newUser._id);
    await storeRefreshToken(newUser._id, refresh_token);
    setCookie(res, access_token, refresh_token);
    res.status(201).json({ message: "User registered successfully" });
  }catch(error) {
    console.error("Error during signup:", error);
    res.status(500).send("Server error");
  }
};

export const login = async (req, res) => {
    try {       
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide all required fields" });
        }
      

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const { access_token, refresh_token } = await generateToken(user._id);
        await storeRefreshToken(user._id, refresh_token);
        setCookie(res, access_token, refresh_token);
        res.status(200).json({
          message: "Login successful",
          user: user.toJSON ? user.toJSON() : user
        });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send("Server error");
    }
}   

export const logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;     
        if (!refreshToken) {        
            return res.status(400).json({ message: "No refresh token provided" });
        }       
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        await redis.del(decoded.userID);
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.error("Error during logout:", error);
        res.status(500).send("Server error");
    }
}
export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token; 
        if (!refreshToken) {        
            return res.status(400).json({ message: "No refresh token provided" });
        }       
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const storedToken = await redis.get(decoded.userID);
        if (storedToken !== refreshToken) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }
        const { access_token, refresh_token } = await generateToken(decoded.userID);
        await storeRefreshToken(decoded.userID, refresh_token);
        setCookie(res, access_token, refresh_token);
        res.status(200).json({ message: "Token refreshed" });
    } catch (error) {
        console.error("Error during token refresh:", error);
        res.status(500).send("Server error");
    }   
}

export const getProfile = async (req, res) => {
    try {
        const accessToken = req?.cookies?.access_token;
        if (!accessToken) {
            return res.status(401).json({ message: "No access token provided" });
        }

        const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
        const user = await User.findById(decoded.userID).select('-password');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user.toJSON ? user.toJSON() : user);
    } catch (error) {
        console.error("Error fetching profile:", error.message);

        // Handle JWT expiration specifically
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Access token expired" });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: "Invalid access token" });
        }

        res.status(500).json({ message: "Server error" });
    }
}

export const updateProfile = async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      return res.status(401).json({ message: "No access token provided" });
    }

    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.userID);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Extract allowed fields
    const { fullName, email, addresses, phone, altPhone } = req.body;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    if (fullName) user.fullName = fullName;
    if (addresses) user.addresses = addresses;
    if (phone) user.phone = phone;
    if (altPhone) user.altPhone = altPhone;

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: user.toJSON ? user.toJSON() : user,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Access token expired" });
    }
    res.status(500).json({ message: "Server error" });
  }
};
