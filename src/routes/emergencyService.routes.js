const express = require('express');
const router = express.Router();
const emergencyServiceController = require('../controllers/emergencyService.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Public directory routes
router.get('/', emergencyServiceController.getAllEmergencyServices);
router.get('/:serviceId/contacts', emergencyServiceController.getServiceContacts);

// Admin-only contact management routes
router.post('/contacts', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return emergencyServiceController.createServiceContact(req, res, next);
});

router.put('/contacts/:id', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return emergencyServiceController.updateServiceContact(req, res, next);
});

router.delete('/contacts/:id', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return emergencyServiceController.deleteServiceContact(req, res, next);
});

module.exports = router;
