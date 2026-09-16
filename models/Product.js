import mongoose from "mongoose";
const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true }, 
        description: { type: String, required: true },
        price: { type: Number, min: 0, required: true },
        category: { type: String, required: true },
        stock: { type: Number, required: true, default: 0 },
        minStockLevel: { type: Number, required: true, default: 5 },
        image: { type: String, default: "" },
        images: [
            {
                url: { type: String, required: true },
                public_id: { type: String, required: true },
                isPrimary: { type: Boolean, default: false }
            }
        ],
        isFeatured: { type: Boolean, default: false },
        expiryDate: { type: Date },
        batchNumber: { type: String },
        prescriptionRequired: { type: Boolean, default: false },
        manufacturer: { type: String, default: "" },
        composition: { type: String, default: "" },
    },  
    { timestamps: true }
);

// Keep the product image invariant centralized: when a gallery exists,
// exactly one image is primary and the legacy `image` field points to it.
productSchema.pre("validate", function (next) {
    if (Array.isArray(this.images) && this.images.length > 0) {
        let primaryIndex = this.images.findIndex((image) => image.isPrimary === true);
        if (primaryIndex < 0) primaryIndex = 0;

        this.images = this.images.map((image, index) => ({
            ...image.toObject?.() ?? image,
            isPrimary: index === primaryIndex,
        }));

        this.image = this.images[primaryIndex]?.url || this.images[0]?.url || "";
    }

    next();
});

const Product = mongoose.model("Product", productSchema);
export default Product;