const { pool } = require('../config/db');

class ChatRepository {
  /**
   * Check if a user is authorized to participate in an incident chat
   * Authorized users: Incident Reporter, Accepted Responders, and Platform Admins
   */
  async isUserAuthorizedForIncident(incidentId, userId) {
    // 1. Check if Admin
    const [adminRows] = await pool.query(
      `SELECT r.code 
       FROM user_roles ur 
       JOIN roles r ON ur.role_id = r.id 
       WHERE ur.user_id = ? AND r.code = 'ADMIN'`,
      [userId]
    );
    if (adminRows.length > 0) {
      return { authorized: true, role: 'ADMIN' };
    }

    // 2. Check if Incident Reporter
    const [incidentRows] = await pool.query(
      `SELECT id, reported_by, title, status FROM incidents WHERE id = ?`,
      [incidentId]
    );
    if (incidentRows.length === 0) {
      return { authorized: false, reason: 'Incident not found' };
    }

    if (incidentRows[0].reported_by == userId) {
      return { authorized: true, role: 'REPORTER', incident: incidentRows[0] };
    }

    // 3. Check if Accepted Volunteer Responder
    const [volunteerRows] = await pool.query(
      `SELECT id, response_status 
       FROM incident_volunteer_requests 
       WHERE incident_id = ? AND volunteer_user_id = ? AND response_status = 'ACCEPTED'`,
      [incidentId, userId]
    );

    if (volunteerRows.length > 0) {
      return { authorized: true, role: 'RESPONDER', incident: incidentRows[0] };
    }

    return { authorized: false, reason: 'User is not assigned or authorized for this incident channel' };
  }

  /**
   * Get or create the operational conversation for an incident
   */
  async getOrCreateIncidentConversation(incidentId, creatorUserId) {
    // 1. Check if conversation already exists
    const [existing] = await pool.query(
      `SELECT * FROM conversations WHERE incident_id = ? AND conversation_type = 'INCIDENT' LIMIT 1`,
      [incidentId]
    );

    let conversationId;

    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      // Fetch incident title
      const [inc] = await pool.query('SELECT title, reported_by FROM incidents WHERE id = ?', [incidentId]);
      const title = inc.length > 0 ? `Incident #${incidentId}: ${inc[0].title}` : `Incident #${incidentId} Ops`;
      const createdBy = inc.length > 0 && inc[0].reported_by ? inc[0].reported_by : creatorUserId;

      const [res] = await pool.query(
        `INSERT INTO conversations (incident_id, conversation_type, title, created_by)
         VALUES (?, 'INCIDENT', ?, ?)`,
        [incidentId, title, createdBy]
      );
      conversationId = res.insertId;

      // Auto add reporter as participant
      if (inc.length > 0 && inc[0].reported_by) {
        await this.ensureParticipant(conversationId, inc[0].reported_by);
      }
    }

    // Ensure current user is in participants
    if (creatorUserId) {
      await this.ensureParticipant(conversationId, creatorUserId);
    }

    const [fullConv] = await pool.query(
      `SELECT c.*, i.title AS incident_title, i.status AS incident_status, i.severity AS incident_severity
       FROM conversations c
       LEFT JOIN incidents i ON c.incident_id = i.id
       WHERE c.id = ?`,
      [conversationId]
    );

    return fullConv[0];
  }

  /**
   * Ensure user is a participant in conversation
   */
  async ensureParticipant(conversationId, userId) {
    await pool.query(
      `INSERT IGNORE INTO conversation_participants (conversation_id, user_id)
       VALUES (?, ?)`,
      [conversationId, userId]
    );
  }

  /**
   * Get messages for conversation with attachments
   */
  async getConversationMessages(conversationId, { limit = 50, beforeMessageId = null }) {
    let whereClause = 'WHERE m.conversation_id = ? AND m.deleted_at IS NULL';
    const params = [conversationId];

    if (beforeMessageId) {
      whereClause += ' AND m.id < ?';
      params.push(beforeMessageId);
    }

    const query = `
      SELECT 
        m.id,
        m.conversation_id AS conversationId,
        m.sender_user_id AS senderUserId,
        m.message_type AS messageType,
        m.body,
        m.latitude,
        m.longitude,
        m.created_at AS createdAt,
        m.edited_at AS editedAt,
        COALESCE(p.full_name, 'Responder') AS senderName,
        u.phone AS senderPhone,
        p.profile_photo_url AS senderPhoto
      FROM messages m
      JOIN users u ON m.sender_user_id = u.id
      LEFT JOIN user_profiles p ON u.id = p.user_id
      ${whereClause}
      ORDER BY m.id DESC
      LIMIT ?
    `;

    params.push(Number(limit));
    const [rows] = await pool.query(query, params);

    // Messages are fetched DESC for pagination, reverse to chronological ASC
    const messages = rows.reverse();

    if (messages.length === 0) return [];

    // Fetch attachments for these messages
    const messageIds = messages.map((m) => m.id);
    const [attachments] = await pool.query(
      `SELECT id, message_id AS messageId, file_url AS fileUrl, file_name AS fileName, mime_type AS mimeType, file_size_bytes AS fileSizeBytes
       FROM message_attachments
       WHERE message_id IN (?)`,
      [messageIds]
    );

    const attachmentsByMessage = {};
    attachments.forEach((att) => {
      if (!attachmentsByMessage[att.messageId]) {
        attachmentsByMessage[att.messageId] = [];
      }
      attachmentsByMessage[att.messageId].push(att);
    });

    return messages.map((msg) => ({
      ...msg,
      attachments: attachmentsByMessage[msg.id] || []
    }));
  }

  /**
   * Save a message and attachments
   */
  async createMessage({
    conversationId,
    senderUserId,
    messageType = 'TEXT',
    body,
    latitude = null,
    longitude = null,
    attachments = []
  }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Ensure participant
      await connection.query(
        `INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`,
        [conversationId, senderUserId]
      );

      // Insert message
      const [res] = await connection.query(
        `INSERT INTO messages 
          (conversation_id, sender_user_id, message_type, body, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [conversationId, senderUserId, messageType, body, latitude, longitude]
      );

      const messageId = res.insertId;

      // Insert attachments if any
      if (attachments && attachments.length > 0) {
        const attValues = attachments.map((att) => [
          messageId,
          att.fileUrl,
          att.fileName || 'attachment',
          att.mimeType || 'image/jpeg',
          att.fileSizeBytes || null
        ]);

        await connection.query(
          `INSERT INTO message_attachments 
            (message_id, file_url, file_name, mime_type, file_size_bytes)
           VALUES ?`,
          [attValues]
        );
      }

      // Update sender's last read message id
      await connection.query(
        `UPDATE conversation_participants 
         SET last_read_message_id = ? 
         WHERE conversation_id = ? AND user_id = ?`,
        [messageId, conversationId, senderUserId]
      );

      await connection.commit();

      // Fetch newly created message with sender info
      const [fullMsg] = await pool.query(
        `SELECT 
          m.id,
          m.conversation_id AS conversationId,
          m.sender_user_id AS senderUserId,
          m.message_type AS messageType,
          m.body,
          m.latitude,
          m.longitude,
          m.created_at AS createdAt,
          COALESCE(p.full_name, 'Responder') AS senderName,
          u.phone AS senderPhone,
          p.profile_photo_url AS senderPhoto
        FROM messages m
        JOIN users u ON m.sender_user_id = u.id
        LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE m.id = ?`,
        [messageId]
      );

      const [msgAttachments] = await pool.query(
        `SELECT id, message_id AS messageId, file_url AS fileUrl, file_name AS fileName, mime_type AS mimeType 
         FROM message_attachments WHERE message_id = ?`,
        [messageId]
      );

      return {
        ...fullMsg[0],
        attachments: msgAttachments
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get participants of a conversation
   */
  async getParticipants(conversationId) {
    const query = `
      SELECT 
        u.id AS userId,
        COALESCE(p.full_name, 'Responder') AS name,
        u.phone,
        u.email,
        p.profile_photo_url AS photoUrl,
        cp.joined_at AS joinedAt,
        cp.last_read_message_id AS lastReadMessageId,
        (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = u.id) AS roles
      FROM conversation_participants cp
      JOIN users u ON cp.user_id = u.id
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE cp.conversation_id = ? AND cp.left_at IS NULL
    `;
    const [rows] = await pool.query(query, [conversationId]);
    return rows;
  }

  /**
   * Mark messages as read for a user
   */
  async markRead(conversationId, userId, messageId) {
    const [result] = await pool.query(
      `UPDATE conversation_participants 
       SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?)
       WHERE conversation_id = ? AND user_id = ?`,
      [messageId, conversationId, userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Get all active conversations for a user
   */
  async getUserConversations(userId) {
    const query = `
      SELECT 
        c.id,
        c.incident_id AS incidentId,
        c.conversation_type AS conversationType,
        c.title,
        c.created_at AS createdAt,
        i.title AS incidentTitle,
        i.status AS incidentStatus,
        i.severity AS incidentSeverity,
        (
          SELECT m.body 
          FROM messages m 
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL 
          ORDER BY m.id DESC LIMIT 1
        ) AS lastMessageBody,
        (
          SELECT m.created_at 
          FROM messages m 
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL 
          ORDER BY m.id DESC LIMIT 1
        ) AS lastMessageTime,
        (
          SELECT COUNT(*) 
          FROM messages m 
          WHERE m.conversation_id = c.id 
            AND m.deleted_at IS NULL 
            AND m.id > COALESCE(cp.last_read_message_id, 0)
            AND m.sender_user_id != ?
        ) AS unreadCount
      FROM conversation_participants cp
      JOIN conversations c ON cp.conversation_id = c.id
      LEFT JOIN incidents i ON c.incident_id = i.id
      WHERE cp.user_id = ? AND cp.left_at IS NULL
      ORDER BY COALESCE(lastMessageTime, c.created_at) DESC
    `;
    const [rows] = await pool.query(query, [userId, userId]);
    return rows;
  }
}

module.exports = new ChatRepository();
