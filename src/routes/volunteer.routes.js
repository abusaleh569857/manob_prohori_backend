const express = require('express');
const router = express.Router();
const volunteerController = require('../controllers/volunteer.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// All volunteer routes require authentication
router.use(verifyToken);

// 1. Volunteer Profile & Duty Toggle
router.get('/profile/me', volunteerController.getMyProfile);
router.patch('/status', volunteerController.updateStatus);
router.post('/location', volunteerController.updateLocation);

// 2. Skills & Verification Application (Volunteer End)
router.get('/skills', volunteerController.getSkills);
router.get('/verification-application', volunteerController.getVerificationApplication);
router.post('/verification-application', volunteerController.submitVerificationApplication);

// 3. Dispatches Radar & Active Mission
router.get('/dispatches/nearby', volunteerController.getNearbyDispatches);
router.get('/mission/active', volunteerController.getActiveMission);
router.get('/mission/history', volunteerController.getMissionHistory);

// 4. Dispatch Responses & Actions
router.post('/dispatches/:incidentId/accept', volunteerController.acceptDispatch);
router.post('/dispatches/:incidentId/decline', volunteerController.declineDispatch);
router.patch('/dispatches/:incidentId/mission-status', volunteerController.updateMissionStatus);

// 5. Admin Volunteer Directory & Verification Review (Admin End)
router.get('/admin/list', volunteerController.getAdminVolunteersList);
router.patch('/admin/:userId/verify', volunteerController.verifyVolunteer);

module.exports = router;
