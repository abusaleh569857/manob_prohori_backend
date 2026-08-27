const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incident.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  createIncidentSchema,
  updateIncidentStatusSchema,
} = require('../validations/incident.validation');

// Protected incident routes
router.use(verifyToken);

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
