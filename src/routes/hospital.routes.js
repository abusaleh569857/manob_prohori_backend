const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospital.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Public routes
router.get('/specialties', hospitalController.getAllSpecialties);
router.get('/', hospitalController.getAllHospitals);
router.get('/:id', hospitalController.getHospitalById);

// Admin-only protected routes
router.post('/', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return hospitalController.createHospital(req, res, next);
});

router.put('/:id', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return hospitalController.updateHospital(req, res, next);
});

router.patch('/:id/toggle', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return hospitalController.toggleHospitalStatus(req, res, next);
});

router.delete('/:id', verifyToken, (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  return hospitalController.deleteHospital(req, res, next);
});

module.exports = router;
