const { pool } = require('../config/db');

class NotificationRepository {
  /**
   * Create a single notification
   */
  async createNotification({
    userId,
    notificationType,
    title,
    body,
    referenceType = null,
    referenceId = null,
    priority = 'NORMAL'
  }) {
    const [result] = await pool.query(
      `INSERT INTO notifications 
        (user_id, notification_type, title, body, reference_type, reference_id, priority, is_read, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
      [userId, notificationType, title, body, referenceType, referenceId, priority]
    );
    return result.insertId;
  }

  /**
   * Create bulk notifications (e.g. broadcast to multiple volunteers)
   */
  async createBulkNotifications(notifications) {
    if (!notifications || notifications.length === 0) return 0;

    const values = notifications.map((n) => [
      n.userId,
      n.notificationType,
      n.title,
      n.body,
      n.referenceType || null,
      n.referenceId || null,
      n.priority || 'NORMAL',
      false,
      new Date()
    ]);

    const [result] = await pool.query(
      `INSERT INTO notifications 
        (user_id, notification_type, title, body, reference_type, reference_id, priority, is_read, sent_at)
       VALUES ?`,
      [values]
    );
    return result.affectedRows;
  }

  /**
   * Get user's notifications with pagination
   */
  async getUserNotifications(userId, { limit = 20, offset = 0, unreadOnly = false }) {
    let whereClause = 'WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      whereClause += ' AND is_read = FALSE';
    }

    const query = `
      SELECT 
        id,
        user_id AS userId,
        notification_type AS notificationType,
        title,
        body,
        reference_type AS referenceType,
        reference_id AS referenceId,
        priority,
        is_read AS isRead,
        read_at AS readAt,
        sent_at AS sentAt,
        created_at AS createdAt
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM notifications ${whereClause}`,
      params.slice(0, -2)
    );

    return {
      notifications: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Get unread notifications count for a user
   */
  async getUnreadCount(userId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );
    return Number(rows[0]?.unreadCount || 0);
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId, userId) {
    const [result] = await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    const [result] = await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );
    return result.affectedRows;
  }
}

module.exports = new NotificationRepository();
