import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import crypto from 'crypto';

import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });


// Environment-based key selection
const isProduction = process.env.NODE_ENV === 'production';
const keyId =  process.env.RAZORPAY_KEY_ID_TEST;
const keySecret =  process.env.RAZORPAY_KEY_SECRET_TEST;

if (!keyId || !keySecret) {
  throw new Error(`Razorpay ${isProduction ? 'production' : 'test'} keys not configured`);
}

export const instance = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

// Utility function to verify payment signature
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  const sign = orderId + '|' + paymentId;
  const expectedSign = crypto
    .createHmac('sha256', keySecret)
    .update(sign.toString())
    .digest('hex');

  return expectedSign === signature;
};

// Get current Razorpay key ID for frontend
export const getRazorpayKey = () => {
  return keyId;
};