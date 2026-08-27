const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  registerSchema,
  loginSchema,
  changePasswordSchema
} = require('../validations/auth.validation');

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);

// Protected routes
router.get('/profile', verifyToken, authController.getProfile);
router.put('/change-password', verifyToken, validate(changePasswordSchema), authController.changePassword);

module.exports = router;
