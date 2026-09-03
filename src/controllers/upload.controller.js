const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../uploads/incidents');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Handle Base64 Image Upload
 * Accepts an array of base64 images, saves them to disk, and returns public URLs.
 */
const uploadImages = async (req, res, next) => {
  try {
    const { images } = req.body; // Array of base64 strings or single base64 string

    if (!images || (Array.isArray(images) && images.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'No images provided for upload',
      });
    }

    const imageArray = Array.isArray(images) ? images : [images];
    const savedUrls = [];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    for (const item of imageArray) {
      if (typeof item !== 'string' || !item.includes('base64,')) {
        // If it's already an external HTTP URL, keep it
        if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
          savedUrls.push(item);
        }
        continue;
      }

      // Parse mime type and raw base64 data
      const matches = item.match(/^data:(image\/([a-zA-Z0-9]+));base64,(.+)$/);
      if (!matches) continue;

      const extension = matches[2] === 'jpeg' ? 'jpg' : matches[2];
      const base64Data = matches[3];
      const buffer = Buffer.from(base64Data, 'base64');

      // Generate unique file name
      const fileName = `incident-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
      const filePath = path.join(UPLOADS_DIR, fileName);

      // Write file to disk
      fs.writeFileSync(filePath, buffer);

      const publicUrl = `${baseUrl}/uploads/incidents/${fileName}`;
      savedUrls.push(publicUrl);
    }

    return res.status(200).json({
      success: true,
      message: 'Images uploaded successfully',
      data: {
        urls: savedUrls,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
};

module.exports = {
  uploadImages,
};
