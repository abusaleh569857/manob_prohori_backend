const chatRepository = require('../repositories/chat.repository');
const notificationService = require('./notification.service');

class ChatService {
  /**
   * Get or create conversation for an incident with authorization check
   */
  async getIncidentConversation(incidentId, userId) {
    const authCheck = await chatRepository.isUserAuthorizedForIncident(incidentId, userId);
    if (!authCheck.authorized) {
      const error = new Error(authCheck.reason || 'You are not authorized to access this incident chat');
      error.statusCode = 403;
      throw error;
    }

    const conversation = await chatRepository.getOrCreateIncidentConversation(incidentId, userId);
    const participants = await chatRepository.getParticipants(conversation.id);

    return {
      conversation,
      userRole: authCheck.role,
      participants
    };
  }

  /**
   * Get messages for an incident conversation
   */
  async getMessages(incidentId, userId, options) {
    const { conversation } = await this.getIncidentConversation(incidentId, userId);
    const messages = await chatRepository.getConversationMessages(conversation.id, options);
    return {
      conversation,
      messages
    };
  }

  /**
   * Send a message to an incident conversation
   */
  async sendMessage(incidentId, userId, { body, messageType = 'TEXT', latitude, longitude, attachments = [] }) {
    const { conversation, userRole } = await this.getIncidentConversation(incidentId, userId);

    if (!body && (!attachments || attachments.length === 0) && (!latitude || !longitude)) {
      const error = new Error('Message must have text, an attachment, or location coordinates');
      error.statusCode = 400;
      throw error;
    }

    const message = await chatRepository.createMessage({
      conversationId: conversation.id,
      senderUserId: userId,
      messageType,
      body,
      latitude,
      longitude,
      attachments
    });

    // Notify other participants in the background
    try {
      const participants = await chatRepository.getParticipants(conversation.id);
      const otherParticipants = participants.filter((p) => p.userId != userId);

      const snippet = body
        ? (body.length > 80 ? body.slice(0, 77) + '...' : body)
        : (messageType === 'LOCATION' ? 'Shared live GPS location' : 'Shared media attachment');

      for (const p of otherParticipants) {
        notificationService.notifyUser({
          userId: p.userId,
          notificationType: 'CHAT_MESSAGE',
          title: `New message in Incident #${incidentId}`,
          body: `${message.senderName || 'Responder'}: ${snippet}`,
          referenceType: 'INCIDENT',
          referenceId: incidentId,
          priority: 'NORMAL'
        }).catch((err) => console.error('Notification dispatch error:', err.message));
      }
    } catch (notifErr) {
      console.error('Error queuing chat notifications:', notifErr.message);
    }

    return message;
  }

  /**
   * Mark messages as read in conversation
   */
  async markRead(incidentId, userId, messageId) {
    const { conversation } = await this.getIncidentConversation(incidentId, userId);
    return await chatRepository.markRead(conversation.id, userId, messageId);
  }

  /**
   * Get user's active incident conversations
   */
  async getUserConversations(userId) {
    return await chatRepository.getUserConversations(userId);
  }
}

module.exports = new ChatService();
