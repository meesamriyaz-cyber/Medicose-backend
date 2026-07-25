import User from "../models/User.js";

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password -confirmPassword").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error", message: "Failed to fetch users" });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, confirmPassword, fullName, role } = req.body;

    if (!email || !password || !confirmPassword || !fullName) {
      return res.status(400).json({ error: "Invalid input", message: "Email, password, confirm password, and full name are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Invalid input", message: "Password and confirm password do not match" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: "User exists", message: "A user with this email already exists" });
    }

    const newUser = new User({
      email: email.toLowerCase(),
      password,
      confirmPassword,
      fullName,
      role: role || "customer",
    });

    await newUser.save();

    const userResponse = newUser.toJSON ? newUser.toJSON() : newUser;
    delete userResponse.password;
    delete userResponse.confirmPassword;

    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
      success: true,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ error: "Validation failed", message: messages.join(", ") });
    }
    res.status(500).json({ error: "Internal server error", message: "An unexpected error occurred" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, fullName, role, password, confirmPassword } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "Not found", message: "User not found" });
    }

    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
      if (existingUser) {
        return res.status(400).json({ error: "User exists", message: "Email already in use by another account" });
      }
      user.email = email.toLowerCase();
    }

    if (fullName) user.fullName = fullName;
    if (role) user.role = role;
    if (password) {
      if (!confirmPassword) {
        return res.status(400).json({ error: "Invalid input", message: "Confirm password is required when updating password" });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ error: "Invalid input", message: "Password and confirm password do not match" });
      }
      user.password = password;
      user.confirmPassword = confirmPassword;
    }

    await user.save();

    const userResponse = user.toJSON ? user.toJSON() : user;
    delete userResponse.password;
    delete userResponse.confirmPassword;

    res.json({
      message: "User updated successfully",
      user: userResponse,
      success: true,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ error: "Validation failed", message: messages.join(", ") });
    }
    res.status(500).json({ error: "Internal server error", message: "An unexpected error occurred" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "Not found", message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ error: "Invalid operation", message: "Cannot delete an admin user" });
    }

    await user.deleteOne();

    res.json({
      message: "User deleted successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error", message: "An unexpected error occurred" });
  }
};
