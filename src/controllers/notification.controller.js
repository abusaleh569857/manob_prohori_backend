const notificationService = require('../services/notification.service');

class NotificationController {
  async getMyNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, offset = 0, unreadOnly } = req.query;

      const result = await notificationService.getUserNotifications(userId, {
        limit: Number(limit),
        offset: Number(offset),
        unreadOnly: unreadOnly === 'true'
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const count = await notificationService.getUnreadCount(userId);

      return res.status(200).json({
        success: true,
        data: { unreadCount: count }
      });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch unread count'
      });
    }
  }

  async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const updated = await notificationService.markAsRead(id, userId);

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: { updated }
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  }

  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      const count = await notificationService.markAllAsRead(userId);

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        data: { updatedCount: count }
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark all as read'
      });
    }
  }
}

module.exports = new NotificationController();
