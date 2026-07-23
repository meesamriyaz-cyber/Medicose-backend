import Product from "../models/Product.js";
import { sendLowStockAlert, sendExpiryAlert } from "../lib/emailService.js";

export const checkLowStock = async (productId) => {
  try {
    const product = await Product.findById(productId);
    if (!product) return;

    if (product.stock <= product.minStockLevel) {
      await sendLowStockAlert(product);
    }
  } catch (error) {
    console.error("Low stock check error:", error);
  }
};

export const checkExpiryAlerts = async () => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringProducts = await Product.find({
      expiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() },
      stock: { $gt: 0 }
    });

    for (const product of expiringProducts) {
      await sendExpiryAlert(product);
    }

    return expiringProducts;
  } catch (error) {
    console.error("Expiry check error:", error);
    return [];
  }
};

export const getLowStockProducts = async () => {
  try {
    return await Product.aggregate([
      {
        $match: {
          $expr: { $lte: ["$stock", "$minStockLevel"] }
        }
      },
      { $sort: { stock: 1 } }
    ]);
  } catch (error) {
    console.error("Error fetching low stock products:", error);
    return [];
  }
};

export const getExpiringProducts = async (days = 30) => {
  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    return await Product.find({
      expiryDate: { $lte: expiryDate, $gt: new Date() }
    }).sort({ expiryDate: 1 });
  } catch (error) {
    console.error("Error fetching expiring products:", error);
    return [];
  }
};
