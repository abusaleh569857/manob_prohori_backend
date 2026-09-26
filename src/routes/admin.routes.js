const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware');

// All admin routes require verifyToken and ADMIN role
router.use(verifyToken);
router.use(authorizeRoles('ADMIN'));

router.get('/audit-logs', adminController.getAuditLogs);
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/status', adminController.toggleUserStatus);

module.exports = router;
