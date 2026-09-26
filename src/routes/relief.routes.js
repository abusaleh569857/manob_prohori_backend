const express = require('express');
const router = express.Router();
const reliefController = require('../controllers/relief.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware');

// ==========================================
// 1. Public Endpoints
// ==========================================
router.get('/public', reliefController.getPublicReliefRequests);
router.get('/:id', reliefController.getReliefRequestById);
router.post('/:id/donate', reliefController.recordDonation);

// ==========================================
// 2. Protected User Endpoints
// ==========================================
router.post('/', verifyToken, reliefController.createReliefRequest);
router.get('/my/requests', verifyToken, reliefController.getUserReliefRequests);

// ==========================================
// 3. Admin Verification Endpoints
// ==========================================
router.get('/admin/list', verifyToken, authorizeRoles('ADMIN'), reliefController.getAdminReliefRequests);
router.patch('/admin/:id/verify', verifyToken, authorizeRoles('ADMIN'), reliefController.reviewReliefRequest);

module.exports = router;
