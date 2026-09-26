const chatService = require('../services/chat.service');

class ChatController {
  async getIncidentConversation(req, res) {
    try {
      const userId = req.user.id;
      const { incidentId } = req.params;

      const result = await chatService.getIncidentConversation(incidentId, userId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching incident conversation:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to fetch incident conversation'
      });
    }
  }

  async getMessages(req, res) {
    try {
      const userId = req.user.id;
      const { incidentId } = req.params;
      const { limit = 50, beforeMessageId } = req.query;

      const result = await chatService.getMessages(incidentId, userId, {
        limit: Number(limit),
        beforeMessageId: beforeMessageId ? Number(beforeMessageId) : null
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to fetch messages'
      });
    }
  }

  async sendMessage(req, res) {
    try {
      const userId = req.user.id;
      const { incidentId } = req.params;
      const { body, messageType, latitude, longitude, attachments } = req.body;

      const message = await chatService.sendMessage(incidentId, userId, {
        body,
        messageType,
        latitude,
        longitude,
        attachments
      });

      return res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: message
      });
    } catch (error) {
      console.error('Error sending message:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to send message'
      });
    }
  }

  async markRead(req, res) {
    try {
      const userId = req.user.id;
      const { incidentId } = req.params;
      const { messageId } = req.body;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: 'messageId is required'
        });
      }

      const updated = await chatService.markRead(incidentId, userId, messageId);

      return res.status(200).json({
        success: true,
        message: 'Messages marked as read',
        data: { updated }
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to mark messages as read'
      });
    }
  }

  async getMyConversations(req, res) {
    try {
      const userId = req.user.id;
      const conversations = await chatService.getUserConversations(userId);

      return res.status(200).json({
        success: true,
        data: conversations
      });
    } catch (error) {
      console.error('Error fetching user conversations:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch conversations'
      });
    }
  }
}

module.exports = new ChatController();
