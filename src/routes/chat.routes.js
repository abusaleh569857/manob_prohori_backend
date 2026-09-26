const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// All chat routes require user authentication
router.use(verifyToken);

// User conversations list
router.get('/conversations', chatController.getMyConversations);

// Incident-specific chat endpoints
router.get('/incident/:incidentId/conversation', chatController.getIncidentConversation);
router.get('/incident/:incidentId/messages', chatController.getMessages);
router.post('/incident/:incidentId/messages', chatController.sendMessage);
router.post('/incident/:incidentId/read', chatController.markRead);

module.exports = router;
