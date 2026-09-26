const { pool } = require('../config/db');

// Standard ABO & Rh blood compatibility matrix
// Recipient code -> Array of donor blood codes that can safely donate
const BLOOD_COMPATIBILITY = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], // Universal recipient
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'] // Universal donor
};

class BloodRepository {
  /**
   * Get all blood groups
   */
  async getBloodGroups() {
    const [rows] = await pool.query('SELECT id, code, name FROM blood_groups ORDER BY id ASC');
    return rows;
  }

  /**
   * Get donor profile by user ID
   */
  async getDonorProfile(userId) {
    const query = `
      SELECT 
        bdp.user_id,
        bdp.blood_group_id,
        bg.code AS blood_group_code,
        bg.name AS blood_group_name,
        bdp.availability,
        bdp.last_donation_date,
        bdp.latitude,
        bdp.longitude,
        bdp.location_updated_at,
        bdp.verification_status,
        COALESCE(up.full_name, 'Blood Donor') AS full_name,
        u.phone AS phone_number,
        u.email,
        up.district,
        up.upazila,
        COALESCE(up.address_line, up.district, 'Bangladesh') AS address_text
      FROM blood_donor_profiles bdp
      JOIN blood_groups bg ON bdp.blood_group_id = bg.id
      JOIN users u ON bdp.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE bdp.user_id = ?
    `;
    const [rows] = await pool.query(query, [userId]);
    if (!rows.length) return null;

    const profile = rows[0];

    // Get latest verification record
    const [verifications] = await pool.query(
      `SELECT * FROM blood_donor_verifications 
       WHERE donor_user_id = ? 
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    profile.latest_verification = verifications[0] || null;

    // Get documents
    const [documents] = await pool.query(
      `SELECT * FROM blood_donor_documents 
       WHERE donor_user_id = ? 
       ORDER BY uploaded_at DESC`,
      [userId]
    );
    profile.documents = documents;

    return profile;
  }

  /**
   * Apply / Register as a Blood Donor
   */
  async applyAsDonor(userId, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        bloodGroupId,
        availability = 'AVAILABLE',
        lastDonationDate = null,
        latitude = null,
        longitude = null,
        verificationType = 'BLOOD_REPORT',
        hospitalName = null,
        reportDate = null,
        documentUrl,
        notes = null
      } = data;

      // 1. Upsert blood_donor_profiles
      await connection.query(
        `INSERT INTO blood_donor_profiles 
          (user_id, blood_group_id, availability, last_donation_date, latitude, longitude, location_updated_at, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), 'PENDING')
         ON DUPLICATE KEY UPDATE
          blood_group_id = VALUES(blood_group_id),
          availability = VALUES(availability),
          last_donation_date = VALUES(last_donation_date),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          location_updated_at = NOW(),
          verification_status = 'PENDING'`,
        [userId, bloodGroupId, availability, lastDonationDate, latitude, longitude]
      );

      // 2. Insert verification record
      let verificationId = null;
      if (documentUrl) {
        const [vResult] = await connection.query(
          `INSERT INTO blood_donor_verifications 
            (donor_user_id, verification_type, status, hospital_name, report_date, blood_group_id, document_url, notes)
           VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?)`,
          [userId, verificationType, hospitalName, reportDate, bloodGroupId, documentUrl, notes]
        );
        verificationId = vResult.insertId;

        // 3. Insert into documents table
        await connection.query(
          `INSERT INTO blood_donor_documents 
            (donor_user_id, document_type, file_url)
           VALUES (?, ?, ?)`,
          [userId, verificationType, documentUrl]
        );
      }

      await connection.commit();
      return { success: true, userId, verificationId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update donor availability (AVAILABLE | UNAVAILABLE)
   */
  async updateDonorAvailability(userId, availability) {
    await pool.query(
      `UPDATE blood_donor_profiles 
       SET availability = ? 
       WHERE user_id = ?`,
      [availability, userId]
    );
    return { success: true, availability };
  }

  /**
   * Update donor profile details (last donation date, GPS coordinates)
   */
  async updateDonorProfile(userId, { lastDonationDate, latitude, longitude }) {
    await pool.query(
      `UPDATE blood_donor_profiles 
       SET 
         last_donation_date = COALESCE(?, last_donation_date),
         latitude = COALESCE(?, latitude),
         longitude = COALESCE(?, longitude),
         location_updated_at = NOW()
       WHERE user_id = ?`,
      [lastDonationDate, latitude, longitude, userId]
    );
    return { success: true };
  }

  /**
   * Admin: Get all donors list with filters
   */
  async getAdminDonorsList({ search, bloodGroup, status, limit = 50, offset = 0 }) {
    let whereConditions = ['1=1'];
    const params = [];

    if (status && status !== 'ALL') {
      whereConditions.push('bdp.verification_status = ?');
      params.push(status);
    }

    if (bloodGroup && bloodGroup !== 'ALL') {
      whereConditions.push('bg.code = ?');
      params.push(bloodGroup);
    }

    if (search && search.trim() !== '') {
      whereConditions.push('(up.full_name LIKE ? OR u.phone LIKE ? OR up.address_line LIKE ? OR up.district LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM blood_donor_profiles bdp
       JOIN blood_groups bg ON bdp.blood_group_id = bg.id
       JOIN users u ON bdp.user_id = u.id
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE ${whereClause}`,
      params
    );

    // Get paginated donors
    const query = `
      SELECT 
        bdp.user_id,
        COALESCE(up.full_name, 'Blood Donor') AS name,
        u.phone AS phone,
        u.email,
        bg.code AS blood_group,
        bg.name AS blood_group_name,
        bdp.availability,
        bdp.last_donation_date,
        bdp.verification_status,
        bdp.verified_at,
        bdp.latitude,
        bdp.longitude,
        COALESCE(up.address_line, up.district, 'Bangladesh') AS location,
        v.id AS verification_id,
        v.verification_type,
        v.hospital_name,
        v.report_date,
        v.document_url,
        v.notes,
        v.submitted_at
      FROM blood_donor_profiles bdp
      JOIN blood_groups bg ON bdp.blood_group_id = bg.id
      JOIN users u ON bdp.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN (
        SELECT v1.* 
        FROM blood_donor_verifications v1
        INNER JOIN (
          SELECT donor_user_id, MAX(id) AS max_id 
          FROM blood_donor_verifications 
          GROUP BY donor_user_id
        ) v2 ON v1.id = v2.max_id
      ) v ON bdp.user_id = v.donor_user_id
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN bdp.verification_status = 'PENDING' THEN 0 ELSE 1 END,
        bdp.user_id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [donors] = await pool.query(query, params);

    return {
      donors,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Admin: Review and verify/reject donor application
   */
  async reviewDonorVerification(donorUserId, { status, notes, reviewerId }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update verification record
      await connection.query(
        `UPDATE blood_donor_verifications 
         SET status = ?, notes = ?, reviewed_at = NOW(), reviewed_by = ?
         WHERE donor_user_id = ?
         ORDER BY id DESC LIMIT 1`,
        [status, notes || null, reviewerId, donorUserId]
      );

      // 2. Update donor profile
      await connection.query(
        `UPDATE blood_donor_profiles 
         SET 
           verification_status = ?,
           verified_at = IF(? = 'APPROVED', NOW(), NULL),
           verified_by = IF(? = 'APPROVED', ?, NULL)
         WHERE user_id = ?`,
        [status, status, status, reviewerId, donorUserId]
      );

      // 3. If APPROVED, assign BLOOD_DONOR role to user
      if (status === 'APPROVED') {
        const [roleRows] = await connection.query(
          `SELECT id FROM roles WHERE code = 'BLOOD_DONOR'`
        );
        if (roleRows.length > 0) {
          const roleId = roleRows[0].id;
          await connection.query(
            `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) 
             VALUES (?, ?, ?)`,
            [donorUserId, roleId, reviewerId]
          );
        }
      }

      await connection.commit();
      return { success: true, donorUserId, status };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Create a new Blood Request
   */
  async createBloodRequest(data) {
    const {
      requestedBy,
      incidentId = null,
      bloodGroupId,
      requiredUnits = 1.0,
      hospitalId = null,
      hospitalName = null,
      contactPhone = null,
      neededBy = null,
      description = null,
      latitude,
      longitude,
      addressText = null
    } = data;

    const [result] = await pool.query(
      `INSERT INTO blood_requests 
        (requested_by, incident_id, blood_group_id, required_units, hospital_id, hospital_name, contact_phone, needed_by, description, latitude, longitude, address_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        requestedBy,
        incidentId,
        bloodGroupId,
        requiredUnits,
        hospitalId,
        hospitalName,
        contactPhone,
        neededBy,
        description,
        latitude,
        longitude,
        addressText
      ]
    );

    return result.insertId;
  }

  /**
   * Find matching donors for a blood request
   * Compatible blood groups + APPROVED + AVAILABLE + Haversine distance proximity
   */
  async findMatchingDonors(bloodGroupId, reqLat, reqLng, radiusKm = 30, limit = 20) {
    // 1. Get recipient blood group code
    const [groupRows] = await pool.query('SELECT code FROM blood_groups WHERE id = ?', [bloodGroupId]);
    if (!groupRows.length) return [];

    const recipientCode = groupRows[0].code;
    const compatibleCodes = BLOOD_COMPATIBILITY[recipientCode] || [recipientCode];

    // 2. Query donors with compatible blood group who are AVAILABLE and APPROVED
    // Calculate Haversine distance in km
    const query = `
      SELECT 
        bdp.user_id,
        COALESCE(up.full_name, 'Blood Donor') AS full_name,
        u.phone AS phone_number,
        bg.code AS blood_group_code,
        bdp.latitude,
        bdp.longitude,
        ROUND(
          6371 * ACOS(
            LEAST(1.0, GREATEST(-1.0,
              COS(RADIANS(?)) * COS(RADIANS(bdp.latitude)) *
              COS(RADIANS(bdp.longitude) - RADIANS(?)) +
              SIN(RADIANS(?)) * SIN(RADIANS(bdp.latitude))
            ))
          ),
          2
        ) AS distance_km
      FROM blood_donor_profiles bdp
      JOIN blood_groups bg ON bdp.blood_group_id = bg.id
      JOIN users u ON bdp.user_id = u.id
      LEFT JOIN user_profiles up ON bdp.user_id = up.user_id
      WHERE bdp.verification_status = 'APPROVED'
        AND bdp.availability = 'AVAILABLE'
        AND bg.code IN (?)
        AND bdp.latitude IS NOT NULL 
        AND bdp.longitude IS NOT NULL
      HAVING distance_km <= ?
      ORDER BY distance_km ASC
      LIMIT ?
    `;

    const [rows] = await pool.query(query, [
      reqLat,
      reqLng,
      reqLat,
      compatibleCodes,
      radiusKm,
      limit
    ]);

    return rows;
  }

  /**
   * Bulk insert into blood_request_matches
   */
  async createBloodRequestMatches(bloodRequestId, donorMatches) {
    if (!donorMatches || donorMatches.length === 0) return [];

    const values = donorMatches.map((donor) => [
      bloodRequestId,
      donor.user_id,
      donor.distance_km,
      'MATCHED',
      'PENDING'
    ]);

    await pool.query(
      `INSERT IGNORE INTO blood_request_matches 
        (blood_request_id, donor_user_id, distance_km, notification_stage, status)
       VALUES ?`,
      [values]
    );

    return donorMatches;
  }

  /**
   * Public: Get blood requests with filters
   */
  async getPublicBloodRequests({ bloodGroup, status = 'OPEN', search, latitude, longitude, limit = 20, offset = 0 }) {
    let whereConditions = ['1=1'];
    const params = [];

    if (status && status !== 'ALL') {
      whereConditions.push('br.status = ?');
      params.push(status);
    }

    if (bloodGroup && bloodGroup !== 'ALL') {
      whereConditions.push('bg.code = ?');
      params.push(bloodGroup);
    }

    if (search && search.trim() !== '') {
      whereConditions.push('(br.hospital_name LIKE ? OR br.address_text LIKE ? OR br.description LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.join(' AND ');

    let distanceSelect = 'NULL AS distance_km';
    let orderByClause = 'br.id DESC';

    if (latitude && longitude && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      distanceSelect = `
        ROUND(
          6371 * ACOS(
            LEAST(1.0, GREATEST(-1.0,
              COS(RADIANS(${lat})) * COS(RADIANS(br.latitude)) *
              COS(RADIANS(br.longitude) - RADIANS(${lng})) +
              SIN(RADIANS(${lat})) * SIN(RADIANS(br.latitude))
            ))
          ),
          2
        ) AS distance_km
      `;
      orderByClause = 'distance_km ASC, br.id DESC';
    }

    const query = `
      SELECT 
        br.id,
        br.requested_by,
        COALESCE(up.full_name, 'Citizen') AS requester_name,
        COALESCE(br.contact_phone, u.phone) AS contact_phone,
        br.incident_id,
        br.blood_group_id,
        bg.code AS blood_group_code,
        bg.name AS blood_group_name,
        br.required_units,
        br.hospital_id,
        COALESCE(h.name, br.hospital_name, 'Medical Facility') AS hospital_name,
        br.needed_by,
        br.description,
        br.latitude,
        br.longitude,
        br.address_text,
        br.status,
        br.created_at,
        br.updated_at,
        (SELECT COUNT(*) FROM blood_request_matches brm WHERE brm.blood_request_id = br.id) AS matches_count,
        ${distanceSelect}
      FROM blood_requests br
      JOIN blood_groups bg ON br.blood_group_id = bg.id
      JOIN users u ON br.requested_by = u.id
      LEFT JOIN user_profiles up ON br.requested_by = up.user_id
      LEFT JOIN hospitals h ON br.hospital_id = h.id
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    // Count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM blood_requests br
       JOIN blood_groups bg ON br.blood_group_id = bg.id
       WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    return {
      requests: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Get single blood request by ID
   */
  async getBloodRequestById(id) {
    const query = `
      SELECT 
        br.*,
        bg.code AS blood_group_code,
        bg.name AS blood_group_name,
        COALESCE(up.full_name, 'Citizen') AS requester_name,
        COALESCE(br.contact_phone, u.phone) AS contact_phone,
        h.name AS linked_hospital_name,
        (SELECT COUNT(*) FROM blood_request_matches brm WHERE brm.blood_request_id = br.id) AS matches_count
      FROM blood_requests br
      JOIN blood_groups bg ON br.blood_group_id = bg.id
      JOIN users u ON br.requested_by = u.id
      LEFT JOIN user_profiles up ON br.requested_by = up.user_id
      LEFT JOIN hospitals h ON br.hospital_id = h.id
      WHERE br.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    return rows[0] || null;
  }

  /**
   * Update blood request status (OPEN | FULFILLED | CANCELLED | EXPIRED)
   */
  async updateBloodRequestStatus(requestId, userId, status, isAdmin = false) {
    let query = `UPDATE blood_requests SET status = ? WHERE id = ?`;
    const params = [status, requestId];

    if (!isAdmin) {
      query += ` AND requested_by = ?`;
      params.push(userId);
    }

    const [result] = await pool.query(query, params);
    return result.affectedRows > 0;
  }

  /**
   * Get matched requests for a donor
   */
  async getDonorMatches(donorUserId) {
    const query = `
      SELECT 
        brm.id AS match_id,
        brm.blood_request_id,
        brm.distance_km,
        brm.notification_stage,
        brm.status AS match_status,
        brm.requested_at AS matched_at,
        brm.responded_at,
        br.required_units,
        br.needed_by,
        br.description,
        br.address_text,
        br.latitude,
        br.longitude,
        br.status AS request_status,
        bg.code AS blood_group_code,
        COALESCE(h.name, br.hospital_name, 'Hospital') AS hospital_name,
        COALESCE(up.full_name, 'Citizen') AS requester_name,
        COALESCE(br.contact_phone, u.phone) AS contact_phone
      FROM blood_request_matches brm
      JOIN blood_requests br ON brm.blood_request_id = br.id
      JOIN blood_groups bg ON br.blood_group_id = bg.id
      JOIN users u ON br.requested_by = u.id
      LEFT JOIN user_profiles up ON br.requested_by = up.user_id
      LEFT JOIN hospitals h ON br.hospital_id = h.id
      WHERE brm.donor_user_id = ?
      ORDER BY 
        CASE WHEN brm.status = 'PENDING' THEN 0 ELSE 1 END,
        brm.requested_at DESC
    `;
    const [rows] = await pool.query(query, [donorUserId]);
    return rows;
  }

  /**
   * Respond to blood match (ACCEPTED | DECLINED)
   */
  async respondToBloodMatch(matchId, donorUserId, status) {
    const [result] = await pool.query(
      `UPDATE blood_request_matches 
       SET status = ?, responded_at = NOW() 
       WHERE id = ? AND donor_user_id = ?`,
      [status, matchId, donorUserId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Public: Search verified and available donors
   */
  async searchVerifiedDonors({ bloodGroup, division, district, search, limit = 20, offset = 0 }) {
    let whereConditions = [
      "bdp.verification_status = 'APPROVED'",
      "bdp.availability = 'AVAILABLE'"
    ];
    const params = [];

    if (bloodGroup && bloodGroup !== 'ALL') {
      whereConditions.push('bg.code = ?');
      params.push(bloodGroup);
    }

    if (division && division !== 'ALL') {
      whereConditions.push('up.division = ?');
      params.push(division);
    }

    if (district && district !== 'ALL') {
      whereConditions.push('up.district = ?');
      params.push(district);
    }

    if (search && search.trim() !== '') {
      whereConditions.push('(up.full_name LIKE ? OR up.address_line LIKE ? OR up.district LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        bdp.user_id,
        COALESCE(up.full_name, 'Blood Donor') AS name,
        u.phone AS phone,
        bg.code AS blood_group,
        bg.name AS blood_group_name,
        bdp.availability,
        bdp.last_donation_date,
        bdp.verified_at,
        up.district,
        up.upazila,
        COALESCE(up.address_line, up.district, 'Bangladesh') AS location
      FROM blood_donor_profiles bdp
      JOIN blood_groups bg ON bdp.blood_group_id = bg.id
      JOIN users u ON bdp.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE ${whereClause}
      ORDER BY bdp.verified_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM blood_donor_profiles bdp
       JOIN blood_groups bg ON bdp.blood_group_id = bg.id
       LEFT JOIN user_profiles up ON bdp.user_id = up.user_id
       WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    return {
      donors: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }
}

module.exports = new BloodRepository();
