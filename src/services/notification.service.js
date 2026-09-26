const notificationRepository = require('../repositories/notification.repository');

class NotificationService {
  /**
   * Dispatch a notification to a specific user
   */
  async notifyUser({
    userId,
    notificationType,
    title,
    body,
    referenceType = null,
    referenceId = null,
    priority = 'NORMAL'
  }) {
    if (!userId || !title || !body) return null;

    const id = await notificationRepository.createNotification({
      userId,
      notificationType,
      title,
      body,
      referenceType,
      referenceId,
      priority
    });

    return { id, userId, notificationType, title, body };
  }

  /**
   * Dispatch notifications to multiple users
   */
  async notifyUsers(userIds, { notificationType, title, body, referenceType = null, referenceId = null, priority = 'NORMAL' }) {
    if (!userIds || userIds.length === 0) return 0;
    const notifications = userIds.map((userId) => ({
      userId,
      notificationType,
      title,
      body,
      referenceType,
      referenceId,
      priority
    }));
    return await notificationRepository.createBulkNotifications(notifications);
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, options) {
    return await notificationRepository.getUserNotifications(userId, options);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    return await notificationRepository.getUnreadCount(userId);
  }

  /**
   * Mark as read
   */
  async markAsRead(notificationId, userId) {
    return await notificationRepository.markAsRead(notificationId, userId);
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId) {
    return await notificationRepository.markAllAsRead(userId);
  }
}

module.exports = new NotificationService();
