const { pool } = require('../config/db');

class AuditRepository {
  /**
   * Record a new audit log
   */
  async createLog({
    actorUserId,
    action,
    entityType,
    entityId = null,
    oldValues = null,
    newValues = null,
    ipAddress = null,
    userAgent = null
  }) {
    const [result] = await pool.query(
      `INSERT INTO audit_logs 
        (actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        actorUserId || null,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent
      ]
    );
    return result.insertId;
  }

  /**
   * Get paginated audit logs
   */
  async getAuditLogs({ search, entityType, action, limit = 50, offset = 0 }) {
    let whereConditions = ['1=1'];
    const params = [];

    if (entityType && entityType !== 'ALL') {
      whereConditions.push('al.entity_type = ?');
      params.push(entityType);
    }

    if (action && action !== 'ALL') {
      whereConditions.push('al.action = ?');
      params.push(action);
    }

    if (search && search.trim() !== '') {
      whereConditions.push('(al.action LIKE ? OR al.entity_type LIKE ? OR p.full_name LIKE ? OR al.ip_address LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        al.id,
        al.actor_user_id AS actorUserId,
        al.action,
        al.entity_type AS entityType,
        al.entity_id AS entityId,
        al.old_values AS oldValues,
        al.new_values AS newValues,
        al.ip_address AS ipAddress,
        al.user_agent AS userAgent,
        al.created_at AS createdAt,
        COALESCE(p.full_name, u.phone, 'Command Authority') AS actorName,
        u.email AS actorEmail
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE ${whereClause}
      ORDER BY al.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total 
       FROM audit_logs al 
       LEFT JOIN users u ON al.actor_user_id = u.id
       LEFT JOIN user_profiles p ON u.id = p.user_id
       WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    return {
      logs: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Seed realistic initial audit logs if table is empty
   */
  async seedInitialLogs() {
    const [existing] = await pool.query('SELECT COUNT(*) AS total FROM audit_logs');
    if (existing[0]?.total > 0) return;

    const sampleLogs = [
      [
        1,
        'INCIDENT_DISPATCH_OVERRIDE',
        'INCIDENT',
        1,
        null,
        JSON.stringify({ dispatchedCount: 5, radiusKm: 10 }),
        '103.145.120.45',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      ],
      [
        1,
        'VOLUNTEER_VERIFICATION_APPROVED',
        'VOLUNTEER_VERIFICATION',
        1,
        JSON.stringify({ status: 'PENDING' }),
        JSON.stringify({ status: 'APPROVED', verifiedBy: 'Super Admin' }),
        '103.145.120.45',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      ],
      [
        1,
        'RELIEF_APPLICATION_APPROVED',
        'RELIEF_REQUEST',
        1,
        JSON.stringify({ status: 'PENDING', public_visibility: false }),
        JSON.stringify({ status: 'APPROVED', public_visibility: true }),
        '103.145.120.45',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      ],
      [
        1,
        'DONOR_VERIFICATION_APPROVED',
        'BLOOD_DONOR',
        1,
        JSON.stringify({ verification_status: 'PENDING' }),
        JSON.stringify({ verification_status: 'APPROVED', blood_group: 'O+' }),
        '103.145.120.45',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      ]
    ];

    for (const log of sampleLogs) {
      await pool.query(
        `INSERT INTO audit_logs 
          (actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL FLOOR(RAND() * 3600) SECOND)`,
        log
      );
    }
    console.log(' Seeded initial audit logs for traceability.');
  }

  /**
   * Get all registered users for Admin User Management
   */
  async getAllUsers({ search, limit = 50, offset = 0 }) {
    let whereConditions = ['1=1'];
    const params = [];

    if (search && search.trim() !== '') {
      whereConditions.push('(p.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        u.id,
        u.email,
        u.phone,
        u.is_active AS isActive,
        u.is_phone_verified AS isPhoneVerified,
        u.is_email_verified AS isEmailVerified,
        u.created_at AS createdAt,
        u.last_login_at AS lastLoginAt,
        COALESCE(p.full_name, 'Citizen') AS fullName,
        p.gender,
        p.district,
        p.upazila,
        p.profile_photo_url AS photoUrl,
        (
          SELECT GROUP_CONCAT(r.code) 
          FROM user_roles ur 
          JOIN roles r ON ur.role_id = r.id 
          WHERE ur.user_id = u.id
        ) AS roles
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE ${whereClause}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total 
       FROM users u 
       LEFT JOIN user_profiles p ON u.id = p.user_id 
       WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    return {
      users: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Toggle user active status
   */
  async toggleUserStatus(userId, isActive) {
    const [result] = await pool.query(
      `UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?`,
      [isActive ? 1 : 0, userId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new AuditRepository();
