const express = require('express');
const router = express.Router();
const incidentCategoryController = require('../controllers/incidentCategory.controller');

// Public route to get all active incident categories
router.get('/', incidentCategoryController.getCategories);

module.exports = router;
