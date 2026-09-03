const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Protected Upload Endpoint
router.post('/', verifyToken, uploadController.uploadImages);

module.exports = router;
