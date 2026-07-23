import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const addressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String },
    notes: { type: String }, // landmark / notes
    lat: { type: Number },
    lon: { type: Number },
    display_name: { type: String }, // from reverse geocode
    isDefault: { type: Boolean, default: false }
  },
  { _id: false } // don’t need a separate _id for each address
);


const userSchema = new mongoose.Schema(
    {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, message: "email is reqd"},
    password: { type: String, required: true, "message": "password is reqd ", minlength: 6 },
    confirmPassword: {
      type: String,
      required: function() {
        // Only required if password is being modified
        return this.isModified('password');
      },
      validate: {
        validator: function (el) {
          // Only validate if password is being modified and confirmPassword is provided
          if (this.isModified('password')) {
            return el === this.password;
          }
          return true; // Skip validation if password is not being modified
        },
        message: "confirmPassword must match password"
      }
    },
    fullName: { type: String, required: true, message: "FullName is reqd" },
    cartItems: {
        type: [
            {
                productId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true
                },
                quantity: { type: Number, default: 1, min: 1 }
            }
        ],
        default: []
    },
      addresses: {
      type: [addressSchema],
      default: []
    },

     role: { type: String, enum: ["customer", "staff", "admin"], default: "customer" },
   },


 
{ timestamps: true }
);

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.confirmPassword;
    return ret;
  },
});


userSchema.pre("save", async function (next) {
    // Only hash password if it's being modified and confirmPassword is provided
    if (this.isModified("password") && this.confirmPassword) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    // Always clear confirmPassword after save
    this.confirmPassword = undefined;

    next();
});

userSchema.methods.matchPassword = async function (password) {
    return await bcrypt.compare(password, this.password);
}

const User = mongoose.model("User", userSchema);

export default User;