const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incident.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  createIncidentSchema,
  updateIncidentStatusSchema,
} = require('../validations/incident.validation');

// ============================================================================
// 1. PUBLIC ROUTES (Accessible without authentication on Home Page)
// ============================================================================
// Get ONLY admin-verified & dispatched emergencies for public feed
router.get('/public/verified', (req, res, next) => {
  req.query.status = 'VERIFIED_ONLY';
  return incidentController.getAllIncidents(req, res, next);
});

// ============================================================================
// 2. PROTECTED INCIDENT ROUTES (Requires Authentication)
// ============================================================================
router.use(verifyToken);

// Admin Overview Statistics & Metrics
router.get('/admin/overview-stats', incidentController.getAdminOverviewStats);

// Get All Incidents (For Admin moderation, Triage, and Volunteer feeds)
router.get('/', incidentController.getAllIncidents);

// Create new incident
router.post('/', validate(createIncidentSchema), incidentController.createIncident);

// Get current user's incidents
router.get('/my', incidentController.getMyIncidents);

// Get incident details by ID
router.get('/:id', incidentController.getIncidentById);

// Get incident status history
router.get('/:id/history', incidentController.getIncidentHistory);

// Update incident status (moderation/responder workflow)
router.patch('/:id/status', validate(updateIncidentStatusSchema), incidentController.updateIncidentStatus);

module.exports = router;
