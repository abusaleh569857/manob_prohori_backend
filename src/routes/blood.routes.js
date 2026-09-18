const express = require('express');
const router = express.Router();
const bloodController = require('../controllers/blood.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware');

// ==========================================
// 1. Reference & Public Endpoints
// ==========================================
router.get('/groups', bloodController.getBloodGroups);
router.get('/requests', bloodController.getBloodRequests);
router.get('/requests/:id', bloodController.getBloodRequestById);
router.get('/donors/search', bloodController.searchVerifiedDonors);

// ==========================================
// 2. Protected Donor Endpoints
// ==========================================
router.get('/donor/me', verifyToken, bloodController.getMyDonorProfile);
router.post('/donor/apply', verifyToken, bloodController.applyAsDonor);
router.patch('/donor/availability', verifyToken, bloodController.updateAvailability);
router.patch('/donor/profile', verifyToken, bloodController.updateProfile);
router.get('/donor/matches', verifyToken, bloodController.getDonorMatches);
router.post('/donor/matches/:matchId/respond', verifyToken, bloodController.respondToBloodMatch);

// ==========================================
// 3. Protected Blood Requests Creation & Management
// ==========================================
router.post('/requests', verifyToken, bloodController.createBloodRequest);
router.patch('/requests/:id/status', verifyToken, bloodController.updateBloodRequestStatus);

// ==========================================
// 4. Admin Donor Verification & Review Endpoints
// ==========================================
router.get('/admin/donors', verifyToken, authorizeRoles('ADMIN'), bloodController.getAdminDonors);
router.patch('/admin/donors/:userId/verify', verifyToken, authorizeRoles('ADMIN'), bloodController.reviewDonor);

module.exports = router;
