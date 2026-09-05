const express = require('express');
const router = express.Router();
const incidentCategoryController = require('../controllers/incidentCategory.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Public route to get all active incident categories for reports / public feed
router.get('/', incidentCategoryController.getCategories);

// Admin routes for category management (Dynamic taxonomy)
router.get('/admin/all', verifyToken, incidentCategoryController.getAllCategoriesAdmin);
router.post('/admin', verifyToken, incidentCategoryController.createCategory);
router.put('/admin/:id', verifyToken, incidentCategoryController.updateCategory);
router.patch('/admin/:id/toggle', verifyToken, incidentCategoryController.toggleCategoryStatus);
router.delete('/admin/:id', verifyToken, incidentCategoryController.deleteCategory);

module.exports = router;
