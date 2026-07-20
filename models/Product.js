import mongoose from "mongoose";
const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true }, 
        description: { type: String, required: true },
        price: { type: Number, min: 0, required: true },
        category: { type: String, required: true },
        stock: { type: Number, required: true, default: 0 },
        image: { type: String, default: "" },
        images: [
            {
                url: { type: String, required: true },
                public_id: { type: String, required: true },
                isPrimary: { type: Boolean, default: false }
            }
        ],
        isFeatured: { type: Boolean, default: false },
    },  
    { timestamps: true }
);
const Product = mongoose.model("Product", productSchema);
export default Product;