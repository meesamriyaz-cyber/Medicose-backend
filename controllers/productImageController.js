import Product from "../models/Product.js";
import cloudinary from "../lib/cloudinary.js";

const IMAGE_FOLDER = "products";
const IMAGE_TRANSFORMATION = [
  { width: 800, height: 800, crop: "limit", quality: "auto:good" },
];
const IMAGE_UPLOAD_TIMEOUT_MS = 120000;
const DB_TIMEOUT_MS = 30000;
const MAX_IMAGE_DATA_LENGTH = 10 * 1024 * 1024;

const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const isImageData = (value) =>
  typeof value === "string" &&
  /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(value);

const validateImageData = (value) => {
  if (!isImageData(value)) {
    throw new Error("Invalid image data. Please provide a supported base64 image.");
  }

  if (value.length > MAX_IMAGE_DATA_LENGTH) {
    throw new Error("Image data is too large. Please select a smaller image.");
  }
};

const getUploadOptions = () => ({
  folder: IMAGE_FOLDER,
  transformation: IMAGE_TRANSFORMATION,
});

const normalizeImages = (uploadedImages, requestedImages = []) => {
  if (!uploadedImages.length) return [];

  const requestedPrimaryIndex = requestedImages.findIndex(
    (image) => image?.isPrimary === true
  );
  const primaryIndex =
    requestedPrimaryIndex >= 0 ? requestedPrimaryIndex : 0;

  return uploadedImages.map((image, index) => ({
    ...image,
    isPrimary: index === primaryIndex,
  }));
};

const uploadImages = async (images) => {
  const uploadedImages = [];

  try {
    for (const image of images) {
      validateImageData(image?.data);

      const response = await withTimeout(
        cloudinary.uploader.upload(image.data, getUploadOptions()),
        IMAGE_UPLOAD_TIMEOUT_MS,
        "Image upload"
      );

      uploadedImages.push({
        url: response.secure_url,
        public_id: response.public_id,
        isPrimary: false,
      });
    }

    return normalizeImages(uploadedImages, images);
  } catch (error) {
    await cleanupCloudinaryImages(uploadedImages);
    throw error;
  }
};

const extractPublicIdFromUrl = (url) => {
  if (typeof url !== "string" || !url) return null;

  try {
    const parsed = new URL(url);
    const uploadMarker = "/upload/";
    const markerIndex = parsed.pathname.indexOf(uploadMarker);
    if (markerIndex === -1) return null;

    let path = parsed.pathname.slice(markerIndex + uploadMarker.length);
    const segments = path.split("/").filter(Boolean);

    while (segments[0] && /^v\d+$/.test(segments[0])) {
      segments.shift();
    }

    if (!segments.length) return null;

    const last = segments.pop();
    const publicIdLastSegment = last.replace(/\.[^.]+$/, "");
    if (!publicIdLastSegment) return null;

    segments.push(publicIdLastSegment);
    return segments.join("/");
  } catch {
    return null;
  }
};

const getExistingPublicIds = (product) => {
  const ids = new Set();

  if (Array.isArray(product.images)) {
    for (const image of product.images) {
      if (image?.public_id) ids.add(image.public_id);
    }
  }

  if (!ids.size && product.image) {
    const publicId = extractPublicIdFromUrl(product.image);
    if (publicId) ids.add(publicId);
  }

  return [...ids];
};

const cleanupCloudinaryImages = async (images) => {
  for (const image of images) {
    const publicId = image?.public_id;
    if (!publicId) continue;

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.warn(`Cloudinary cleanup failed for ${publicId}:`, error.message);
    }
  }
};

const deleteExistingCloudinaryImages = async (publicIds) => {
  for (const publicId of publicIds) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.warn(`Cloudinary delete failed for ${publicId}:`, error.message);
    }
  }
};

const getImageRequest = (body) => {
  if (Array.isArray(body.images) && body.images.length > 0) {
    return body.images;
  }

  if (body.image) {
    return [{ data: body.image, isPrimary: true }];
  }

  return null;
};

const validateCommonFields = ({ name, description, price, category, stock }) => {
  if (!name || !description || !price || !category || stock === undefined || stock === null) {
    return {
      error: "Missing required fields",
      message:
        "Please provide all required fields: name, description, price, category, stock",
    };
  }

  if (price === "" || isNaN(price) || price < 0) {
    return {
      error: "Invalid price",
      message: "Price must be a valid positive number",
    };
  }

  if (stock === "" || isNaN(stock) || stock < 0) {
    return {
      error: "Invalid stock",
      message: "Stock must be a valid non-negative number",
    };
  }

  return null;
};

export const addProductWithStableImages = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      image,
      stock,
      images,
    } = req.body;

    const validationError = validateCommonFields({
      name,
      description,
      price,
      category,
      stock,
    });

    if (validationError) {
      return res.status(400).json(validationError);
    }

    const imageRequest = getImageRequest({ image, images });
    let uploadedImages = [];

    if (imageRequest) {
      try {
        uploadedImages = await uploadImages(imageRequest);
      } catch (error) {
        console.error("Product image upload error:", error);
        return res.status(400).json({
          error: "Image upload failed",
          message: error.message || "Failed to upload product images",
        });
      }
    }

    const primaryImage =
      uploadedImages.find((item) => item.isPrimary)?.url ||
      uploadedImages[0]?.url ||
      "";

    const newProduct = new Product({
      name,
      description,
      price: parseFloat(price),
      category,
      stock: parseInt(stock, 10),
      minStockLevel: req.body.minStockLevel || 5,
      expiryDate: req.body.expiryDate || undefined,
      batchNumber: req.body.batchNumber || "",
      prescriptionRequired: req.body.prescriptionRequired || false,
      manufacturer: req.body.manufacturer || "",
      composition: req.body.composition || "",
      image: primaryImage,
      images: uploadedImages,
    });

    try {
      await withTimeout(newProduct.save(), DB_TIMEOUT_MS, "Database save");
    } catch (error) {
      await cleanupCloudinaryImages(uploadedImages);
      throw error;
    }

    return res.status(201).json({
      message: "Product added successfully",
      product: newProduct,
      success: true,
    });
  } catch (error) {
    console.error("Error adding product:", error);

    if (error.message?.includes("timed out")) {
      return res.status(504).json({
        error: "Request timeout",
        message: error.message,
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation failed",
        message: messages.join(", "),
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while creating the product",
    });
  }
};

export const updateProductWithStableImages = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      category,
      image,
      stock,
      images,
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        error: "Product not found",
        message: "No product found with the provided ID",
      });
    }

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({
        error: "Invalid name",
        message: "Product name cannot be empty",
      });
    }

    if (description !== undefined && (!description || !description.trim())) {
      return res.status(400).json({
        error: "Invalid description",
        message: "Product description cannot be empty",
      });
    }

    if (category !== undefined && (!category || !category.trim())) {
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

    const imageRequest = getImageRequest({ image, images });
    const existingPublicIds = imageRequest ? getExistingPublicIds(product) : [];
    let uploadedImages = [];

    if (imageRequest) {
      try {
        uploadedImages = await uploadImages(imageRequest);
      } catch (error) {
        console.error("Product image upload error:", error);
        return res.status(400).json({
          error: "Image upload failed",
          message: error.message || "Failed to upload product images",
        });
      }

      if (!uploadedImages.length) {
        return res.status(400).json({
          error: "Image upload failed",
          message: "At least one valid image is required when updating images.",
        });
      }
    }

    const originalState = {
      image: product.image,
      images: product.images,
    };

    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (price !== undefined) product.price = parseFloat(price);
    if (category !== undefined) product.category = category;
    if (stock !== undefined) product.stock = parseInt(stock, 10);
    if (req.body.minStockLevel !== undefined) {
      product.minStockLevel = parseInt(req.body.minStockLevel, 10);
    }
    if (req.body.expiryDate !== undefined) {
      product.expiryDate = req.body.expiryDate || undefined;
    }
    if (req.body.batchNumber !== undefined) {
      product.batchNumber = req.body.batchNumber;
    }
    if (req.body.prescriptionRequired !== undefined) {
      product.prescriptionRequired = req.body.prescriptionRequired;
    }
    if (req.body.manufacturer !== undefined) {
      product.manufacturer = req.body.manufacturer;
    }
    if (req.body.composition !== undefined) {
      product.composition = req.body.composition;
    }

    if (uploadedImages.length > 0) {
      product.images = uploadedImages;
      product.image =
        uploadedImages.find((item) => item.isPrimary)?.url ||
        uploadedImages[0].url;
    }

    try {
      await withTimeout(product.save(), DB_TIMEOUT_MS, "Database save");
    } catch (error) {
      product.image = originalState.image;
      product.images = originalState.images;
      await cleanupCloudinaryImages(uploadedImages);
      throw error;
    }

    // The database now points at the new images, so old Cloudinary assets are
    // removed only after the product save succeeds.
    if (uploadedImages.length > 0 && existingPublicIds.length > 0) {
      await deleteExistingCloudinaryImages(existingPublicIds);
    }

    const userAgent = req.get("User-Agent") || "";
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );

    return res.status(200).json({
      message: `Product updated successfully${isMobile ? " on mobile" : ""}`,
      product,
      success: true,
      isMobile,
    });
  } catch (error) {
    console.error("Error updating product:", error);

    if (error.message?.includes("timed out")) {
      return res.status(504).json({
        error: "Request timeout",
        message: error.message,
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation failed",
        message: messages.join(", "),
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while updating the product",
    });
  }
};
