import Product from "../models/Product.js";
import redis from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getAllProducts = async (req, res) => {
  try {
    // Add timeout to handle network delays from Render
    const productsPromise = Product.find();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database query timeout")), 5000)
    );

    const products = await Promise.race([productsPromise, timeoutPromise]);
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    if (error.message.includes("timeout")) {
      res.status(504).json({
        error: "Request timeout",
        message: "Database connection timeout",
      });
    } else {
      res.status(500).send("Server error");
    }
  }
};

export const getFeaturedProducts = async (req, res) => {
  try {
    let featuredProducts;

    // Try Redis cache first with timeout to handle Render network delays
    try {
      const redisPromise = redis.get("featured_products");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis timeout")), 2000)
      );

      const cachedProducts = await Promise.race([redisPromise, timeoutPromise]);

      if (cachedProducts) {
        return res.status(200).json(JSON.parse(cachedProducts));
      }
    } catch (redisError) {
      // Continue to database fallback
    }

    // Fallback to database
    featuredProducts = await Product.find({ isFeatured: true }).lean();

    if (featuredProducts.length === 0) {
      return res.status(404).json({ message: "No featured products found" });
    }

    // Try to cache the result, but don't fail if Redis is unavailable
    try {
      await redis.set(
        "featured_products",
        JSON.stringify(featuredProducts),
        "EX",
        3600
      ); // 1 hour expiry
    } catch (cacheError) {
      // Don't fail the request if caching fails
    }

    res.status(200).json(featuredProducts);
  } catch (error) {
    console.error("Error fetching featured products:", error);
    res.status(500).send("Server error");
  }
};

export const getProductsByCategory = async (req, res) => {
  try {
    const category = req.params.category;
    const products = await Product.find({ category: category });
    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "No products found in this category" });
    }
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).send("Server error");
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).send("Server error");
  }
};
export const addProduct = async (req, res) => {
  try {
    const { name, description, price, category, image, stock, images } = req.body;
    const imageData = image || images?.[0]?.data;

    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
      ]);

    // Validate required fields
    if (!name || !description || !price || !category || !stock) {
      return res.status(400).json({
        error: "Missing required fields",
        message:
          "Please provide all required fields: name, description, price, category, stock",
      });
    }

    // Validate price is a positive number
    if (price === "" || isNaN(price) || price < 0) {
      return res.status(400).json({
        error: "Invalid price",
        message: "Price must be a valid positive number",
      });
    }

    // Validate stock
    if (stock === "" || isNaN(stock) || stock < 0) {
      return res.status(400).json({
        error: "Invalid stock",
        message: "Stock must be a valid non-negative number",
      });
    }

    const uploadedImages = [];
    
    // Only upload images if image data is provided
    if (imageData) {
      try {
        const imagesToUpload = Array.isArray(images) && images.length > 0
          ? images
          : [{ data: imageData, isPrimary: true }];

        for (let i = 0; i < imagesToUpload.length; i++) {
          const img = imagesToUpload[i];
          if (!img?.data) continue;
          const cloudinaryResponse = await withTimeout(
            cloudinary.uploader.upload(img.data, { folder: "products" }),
            120000,
            "Image upload"
          );
          uploadedImages.push({
            url: cloudinaryResponse.secure_url,
            public_id: cloudinaryResponse.public_id,
            isPrimary: i === 0 || img.isPrimary,
          });
        }
      } catch (cloudinaryError) {
        console.error("Cloudinary upload error:", cloudinaryError);
        return res.status(400).json({
          error: "Image upload failed",
          message: cloudinaryError.message || "Failed to upload product images",
        });
      }
    }

    const primaryImage = uploadedImages.find((img) => img.isPrimary)?.url || uploadedImages[0]?.url || "";

    const newProduct = new Product({
      name,
      description,
      price: parseFloat(price),
      category,
      stock: stock || 0,
      minStockLevel: req.body.minStockLevel || 5,
      expiryDate: req.body.expiryDate || undefined,
      batchNumber: req.body.batchNumber || "",
      prescriptionRequired: req.body.prescriptionRequired || false,
      manufacturer: req.body.manufacturer || "",
      composition: req.body.composition || "",
      image: primaryImage,
      images: uploadedImages,
    });

    await withTimeout(newProduct.save(), 30000, "Database save");

    res.status(201).json({
      message: "Product added successfully",
      product: newProduct,
      success: true,
    });
  } catch (error) {
    console.error("Error adding product:", error);

    if (error.message.includes("timed out")) {
      return res.status(504).json({
        error: "Request timeout",
        message: error.message || "The operation took too long. Please try again.",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation failed",
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while creating the product",
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, image, stock, images } = req.body;
    const imageData = image || images?.[0]?.data;

    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
      ]);

    // Detect if this is a mobile request (user agent check)
    const userAgent = req.get("User-Agent") || "";
    const isMobile =
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent
      );

    // Find the existing product
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        error: "Product not found",
        message: "No product found with the provided ID",
      });
    }

    // Validate required fields if provided
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({
        error: "Invalid name",
        message: "Product name cannot be empty",
      });
    }

    if (description !== undefined && !description.trim()) {
      return res.status(400).json({
        error: "Invalid description",
        message: "Product description cannot be empty",
      });
    }

    if (category !== undefined && !category.trim()) {
      return res.status(400).json({
        error: "Invalid category",
        message: "Product category cannot be empty",
      });
    }

    if (price !== undefined && (price === "" || isNaN(price) || price < 0)) {
      return res.status(400).json({
        error: "Invalid price",
        message: "Price must be a valid positive number",
      });
    }

    if (stock !== undefined && (stock === "" || isNaN(stock) || stock < 0)) {
      return res.status(400).json({
        error: "Invalid stock",
        message: "Stock must be a valid non-negative number",
      });
    }

    let newImageUrl = product.image;
    let uploadedImages = [];
    let cloudinaryResponse;

    // Handle images update if provided
    if (images && Array.isArray(images) && images.length > 0) {
      try {
        // Delete old images from Cloudinary if they exist
        if (product.images && product.images.length > 0) {
          for (const oldImg of product.images) {
            try {
              if (oldImg.public_id) {
                await cloudinary.uploader.destroy(oldImg.public_id);
              }
            } catch (deleteError) {
              // ignore delete failure
            }
          }
        } else if (product.image) {
          try {
            const oldPublicId = product.image.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(
              `haleemmedicose/products/${oldPublicId}`
            );
          } catch (deleteError) {
            // ignore delete failure
          }
        }

        // Upload new images with mobile-specific options
        const uploadOptions = {
          folder: "products",
          ...(isMobile && {
            transformation: [
              { width: 800, height: 800, crop: "limit", quality: "auto:good" },
            ],
          }),
        };

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          if (!img?.data) continue;
          const cloudinaryResponse = await withTimeout(
            cloudinary.uploader.upload(img.data, uploadOptions),
            120000,
            "Image upload"
          );
          uploadedImages.push({
            url: cloudinaryResponse.secure_url,
            public_id: cloudinaryResponse.public_id,
            isPrimary: i === 0 || img.isPrimary,
          });
        }

        if (uploadedImages.length > 0) {
          product.images = uploadedImages;
          const primary = uploadedImages.find((img) => img.isPrimary) || uploadedImages[0];
          product.image = primary.url;
        }
      } catch (cloudinaryError) {
        console.error("Cloudinary upload error:", cloudinaryError);
        return res.status(400).json({
          error: "Image upload failed",
          message: "Failed to upload product images",
        });
      }
    } else if (imageData && imageData !== product.image) {
      try {
        // Delete old images from Cloudinary if they exist
        if (product.images && product.images.length > 0) {
          for (const oldImg of product.images) {
            try {
              if (oldImg.public_id) {
                await cloudinary.uploader.destroy(oldImg.public_id);
              }
            } catch (deleteError) {
              // ignore delete failure
            }
          }
        } else if (product.image) {
          try {
            const oldPublicId = product.image.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(
              `haleemmedicose/products/${oldPublicId}`
            );
          } catch (deleteError) {
            // ignore delete failure
          }
        }

        // Upload new image with mobile-specific options
        const uploadOptions = {
          folder: "products",
          ...(isMobile && {
            transformation: [
              { width: 800, height: 800, crop: "limit", quality: "auto:good" },
            ],
          }),
        };

        cloudinaryResponse = await withTimeout(
          cloudinary.uploader.upload(imageData, uploadOptions),
          120000,
          "Image upload"
        );
        newImageUrl = cloudinaryResponse.secure_url;

        product.images = [
          {
            url: newImageUrl,
            public_id: cloudinaryResponse.public_id,
            isPrimary: true,
          },
        ];
      } catch (cloudinaryError) {
        console.error("Cloudinary upload error:", cloudinaryError);
        return res.status(400).json({
          error: "Image upload failed",
          message: "Failed to upload product image",
        });
      }
    }

    // Update product fields
    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (price !== undefined) product.price = parseFloat(price);
    if (category !== undefined) product.category = category;
    if (stock !== undefined) product.stock = parseInt(stock, 10);
    if (req.body.minStockLevel !== undefined) product.minStockLevel = parseInt(req.body.minStockLevel, 10);
    if (req.body.expiryDate !== undefined) product.expiryDate = req.body.expiryDate || undefined;
    if (req.body.batchNumber !== undefined) product.batchNumber = req.body.batchNumber;
    if (req.body.prescriptionRequired !== undefined) product.prescriptionRequired = req.body.prescriptionRequired;
    if (req.body.manufacturer !== undefined) product.manufacturer = req.body.manufacturer;
    if (req.body.composition !== undefined) product.composition = req.body.composition;
    if (uploadedImages.length > 0) {
      product.image = uploadedImages.find((img) => img.isPrimary)?.url || uploadedImages[0]?.url || product.image;
    } else if (imageData && imageData !== product.image) {
      product.image = newImageUrl;
    }

    // Save the updated product
    await withTimeout(product.save(), 30000, "Database save");

    res.status(200).json({
      message: `Product updated successfully${isMobile ? " on mobile" : ""}`,
      product: product,
      success: true,
      isMobile,
    });
  } catch (error) {
    console.error("Error updating product:", error);

    if (error.message.includes("timed out")) {
      return res.status(504).json({
        error: "Request timeout",
        message: error.message || "The operation took too long. Please try again.",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation failed",
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while updating the product",
    });
  }
};
export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.image) {
      const publicId = product.image.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`haleemmedicose/products/${publicId}`);
    }
    await product.deleteOne();
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).send("Server error");
  }
};

// Additional functions for product management can be added here
export const getRecommendedProducts = async (req, res) => {
  try {
    // Add timeout to handle network delays from Render
    const productsPromise = Product.aggregate([
      { $sample: { size: 3 } },
      {
        $project: {
          _id: 1,
          name: 1,
          price: 1,
          image: 1,
          description: 1,
        },
      },
    ]);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database aggregation timeout")), 5000)
    );

    const products = await Promise.race([productsPromise, timeoutPromise]);
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching recommended products:", error);
    if (error.message.includes("timeout")) {
      res.status(504).json({
        error: "Request timeout",
        message: "Database operation timeout",
      });
    } else {
      res.status(500).send("Server error");
    }
  }
};

export const setFeaturedProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    product.isFeatured = !product.isFeatured;
    await product.save();
    await updateFeaturedProductsCache();
    res.status(200).json({
      message: `Product ${
        product.isFeatured ? "set as" : "removed from"
      } featured successfully`,
      product,
    });
  } catch (error) {
    console.error("Error setting featured product:", error);
    res.status(500).send("Server error");
  }
};

export const decreaseStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      return res.status(400).json({
        error: "Invalid quantity",
        message: "Quantity must be a positive number",
      });
    }

    // Atomic stock decrease — no race condition, no NaN propagation
    const product = await Product.findOneAndUpdate(
      { _id: id, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: true, select: "name stock price" }
    );

    if (!product) {
      // Check if product exists at all vs insufficient stock
      const exists = await Product.findById(id).select("name stock");
      if (!exists) {
        return res.status(404).json({
          error: "Product not found",
          message: "The product to update stock for does not exist",
        });
      }
      return res.status(400).json({
        error: "Insufficient stock",
        message: `Only ${exists.stock} items available, but trying to decrease by ${quantity}`,
        availableStock: exists.stock,
      });
    }

    res.status(200).json({
      message: "Stock decreased successfully",
      product,
      decreasedBy: quantity,
      newStock: product.stock,
    });
  } catch (error) {
    console.error("[DECREASE_STOCK] Error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to decrease stock",
      details: error.message,
    });
  }
};

async function updateFeaturedProductsCache() {
  try {
    const featuredProducts = await Product.find({ isFeatured: true }).lean();
    await redis.set("featured_products", JSON.stringify(featuredProducts));
  } catch (error) {
    console.error("Error updating featured products cache:", error);
  }
}
