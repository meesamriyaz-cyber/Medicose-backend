import { v2 as cloudinary } from 'cloudinary';
import { fileURLToPath } from "url";
import dotenv from 'dotenv';

import   path, {dirname} from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
 dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });
    cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
        api_key: process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET 
    });
     
export default cloudinary; 