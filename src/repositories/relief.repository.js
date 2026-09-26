const { pool } = require('../config/db');

class ReliefRepository {
  /**
   * Create a new Relief Request
   */
  async createReliefRequest(userId, requestData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        incidentId = null,
        title,
        description,
        requiredAmount,
        bkashNumber,
        nagadNumber,
        rocketNumber,
        contactPhone,
        addressText,
        latitude = null,
        longitude = null,
        documents = [] // array of { documentType, fileUrl }
      } = requestData;

      // 1. Insert relief request
      const [insertResult] = await connection.query(
        `INSERT INTO relief_requests 
          (requested_by, incident_id, title, description, required_amount, current_amount, bkash_number, nagad_number, rocket_number, contact_phone, address_text, latitude, longitude, status, public_visibility)
         VALUES (?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, ?, 'PENDING', FALSE)`,
        [
          userId,
          incidentId,
          title,
          description,
          requiredAmount,
          bkashNumber,
          nagadNumber,
          rocketNumber,
          contactPhone,
          addressText,
          latitude,
          longitude
        ]
      );

      const reliefRequestId = insertResult.insertId;

      // 2. Insert documents if any
      if (documents && documents.length > 0) {
        const docValues = documents.map((doc) => [
          reliefRequestId,
          doc.documentType || 'INCIDENT_PROOF',
          doc.fileUrl,
          userId
        ]);

        await connection.query(
          `INSERT INTO relief_request_documents 
            (relief_request_id, document_type, file_url, uploaded_by)
           VALUES ?`,
          [docValues]
        );
      }

      // 3. Insert initial verification record
      await connection.query(
        `INSERT INTO relief_request_verifications 
          (relief_request_id, status, notes)
         VALUES (?, 'PENDING', 'Initial submission awaiting administrator document review')`,
        [reliefRequestId]
      );

      await connection.commit();
      return reliefRequestId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get public verified relief requests
   */
  async getPublicReliefRequests({ search, limit = 20, offset = 0 }) {
    let whereConditions = [
      "rr.status = 'APPROVED'",
      "rr.public_visibility = TRUE"
    ];
    const params = [];

    if (search && search.trim() !== '') {
      whereConditions.push('(rr.title LIKE ? OR rr.description LIKE ? OR rr.address_text LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        rr.id,
        rr.requested_by,
        COALESCE(p.full_name, 'Citizen') AS requester_name,
        COALESCE(rr.contact_phone, u.phone) AS requester_phone,
        rr.incident_id,
        rr.title,
        rr.description,
        rr.required_amount,
        rr.current_amount,
        ROUND((COALESCE(rr.current_amount, 0) / GREATEST(COALESCE(rr.required_amount, 1), 1)) * 100, 1) AS progress_percent,
        rr.bkash_number,
        rr.nagad_number,
        rr.rocket_number,
        rr.contact_phone,
        rr.address_text,
        rr.latitude,
        rr.longitude,
        rr.status,
        rr.public_visibility,
        rr.submitted_at,
        rr.reviewed_at,
        (SELECT file_url FROM relief_request_documents rrd WHERE rrd.relief_request_id = rr.id ORDER BY rrd.id ASC LIMIT 1) AS cover_image,
        (SELECT COUNT(*) FROM relief_donations rd WHERE rd.relief_request_id = rr.id) AS donations_count
      FROM relief_requests rr
      JOIN users u ON rr.requested_by = u.id
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE ${whereClause}
      ORDER BY rr.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM relief_requests rr WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    return {
      campaigns: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Get single relief request by ID with documents and recent contributions
   */
  async getReliefRequestById(id) {
    const query = `
      SELECT 
        rr.*,
        COALESCE(p.full_name, 'Citizen') AS requester_name,
        COALESCE(rr.contact_phone, u.phone) AS requester_phone,
        ROUND((COALESCE(rr.current_amount, 0) / GREATEST(COALESCE(rr.required_amount, 1), 1)) * 100, 1) AS progress_percent,
        (SELECT COUNT(*) FROM relief_donations rd WHERE rd.relief_request_id = rr.id) AS donations_count
      FROM relief_requests rr
      JOIN users u ON rr.requested_by = u.id
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE rr.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    if (!rows.length) return null;

    const relief = rows[0];

    // Get documents
    const [documents] = await pool.query(
      `SELECT id, document_type, file_url, created_at 
       FROM relief_request_documents 
       WHERE relief_request_id = ? 
       ORDER BY id ASC`,
      [id]
    );
    relief.documents = documents;

    // Get recent donations
    const [donations] = await pool.query(
      `SELECT id, donor_name, amount, payment_method, transaction_reference, donated_at 
       FROM relief_donations 
       WHERE relief_request_id = ? AND status = 'CONFIRMED'
       ORDER BY donated_at DESC 
       LIMIT 10`,
      [id]
    );
    relief.recent_donations = donations;

    return relief;
  }

  /**
   * Get user's own submitted relief requests
   */
  async getUserReliefRequests(userId) {
    const query = `
      SELECT 
        rr.*,
        ROUND((COALESCE(rr.current_amount, 0) / GREATEST(COALESCE(rr.required_amount, 1), 1)) * 100, 1) AS progress_percent,
        (SELECT COUNT(*) FROM relief_donations rd WHERE rd.relief_request_id = rr.id) AS donations_count,
        (SELECT file_url FROM relief_request_documents rrd WHERE rrd.relief_request_id = rr.id ORDER BY rrd.id ASC LIMIT 1) AS cover_image
      FROM relief_requests rr
      WHERE rr.requested_by = ?
      ORDER BY rr.id DESC
    `;
    const [rows] = await pool.query(query, [userId]);
    return rows;
  }

  /**
   * Admin: Get all relief requests with filters
   */
  async getAdminReliefRequests({ search, status, limit = 50, offset = 0 }) {
    let whereConditions = ['1=1'];
    const params = [];

    if (status && status !== 'ALL') {
      whereConditions.push('rr.status = ?');
      params.push(status);
    }

    if (search && search.trim() !== '') {
      whereConditions.push('(rr.title LIKE ? OR p.full_name LIKE ? OR u.phone LIKE ? OR rr.address_text LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        rr.*,
        COALESCE(p.full_name, 'Citizen') AS requester_name,
        COALESCE(rr.contact_phone, u.phone) AS requester_phone,
        u.email AS requester_email,
        ROUND((COALESCE(rr.current_amount, 0) / GREATEST(COALESCE(rr.required_amount, 1), 1)) * 100, 1) AS progress_percent,
        (SELECT COUNT(*) FROM relief_request_documents rrd WHERE rrd.relief_request_id = rr.id) AS documents_count,
        (SELECT file_url FROM relief_request_documents rrd WHERE rrd.relief_request_id = rr.id ORDER BY rrd.id ASC LIMIT 1) AS cover_image,
        v.notes AS latest_verification_notes
      FROM relief_requests rr
      JOIN users u ON rr.requested_by = u.id
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN (
        SELECT v1.* 
        FROM relief_request_verifications v1
        INNER JOIN (
          SELECT relief_request_id, MAX(id) AS max_id 
          FROM relief_request_verifications 
          GROUP BY relief_request_id
        ) v2 ON v1.id = v2.max_id
      ) v ON rr.id = v.relief_request_id
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN rr.status = 'PENDING' THEN 0 ELSE 1 END,
        rr.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    const [rows] = await pool.query(query, params);

    // Fetch documents for each item
    for (const item of rows) {
      const [docs] = await pool.query(
        `SELECT id, document_type, file_url FROM relief_request_documents WHERE relief_request_id = ?`,
        [item.id]
      );
      item.documents = docs;
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total 
       FROM relief_requests rr 
       JOIN users u ON rr.requested_by = u.id 
       LEFT JOIN user_profiles p ON u.id = p.user_id
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
   * Admin: Review and verify/reject relief request
   */
  async reviewReliefRequest(id, { status, publicVisibility, notes, rejectionReason, reviewerId }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const visibility = status === 'APPROVED' ? (publicVisibility !== undefined ? publicVisibility : true) : false;

      // 1. Update request status
      await connection.query(
        `UPDATE relief_requests 
         SET 
           status = ?,
           public_visibility = ?,
           reviewed_at = NOW(),
           reviewed_by = ?,
           rejection_reason = IF(? = 'REJECTED', ?, NULL)
         WHERE id = ?`,
        [status, visibility, reviewerId, status, rejectionReason || null, id]
      );

      // 2. Insert verification audit log
      await connection.query(
        `INSERT INTO relief_request_verifications 
          (relief_request_id, status, notes, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [id, status, notes || `Status changed to ${status}`, reviewerId]
      );

      await connection.commit();
      return { success: true, id, status, publicVisibility: visibility };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Record a peer-to-peer direct donation contribution
   */
  async recordDonationContribution(reliefRequestId, donorUserId, contributionData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        amount,
        paymentMethod = 'BKASH',
        transactionReference = null,
        donorName = 'Anonymous Donor',
        donorPhone = null
      } = contributionData;

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Valid donation amount is required');
      }

      // 1. Insert donation record
      const [insertRes] = await connection.query(
        `INSERT INTO relief_donations 
          (relief_request_id, donor_user_id, donor_name, donor_phone, amount, payment_method, transaction_reference, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
        [
          reliefRequestId,
          donorUserId || null,
          donorName,
          donorPhone,
          numAmount,
          paymentMethod,
          transactionReference
        ]
      );

      // 2. Increment current_amount in relief_requests
      await connection.query(
        `UPDATE relief_requests 
         SET current_amount = COALESCE(current_amount, 0) + ? 
         WHERE id = ?`,
        [numAmount, reliefRequestId]
      );

      // 3. Check if target reached
      const [checkRows] = await connection.query(
        `SELECT current_amount, required_amount FROM relief_requests WHERE id = ?`,
        [reliefRequestId]
      );

      if (checkRows.length && checkRows[0].required_amount > 0) {
        if (Number(checkRows[0].current_amount) >= Number(checkRows[0].required_amount)) {
          await connection.query(
            `UPDATE relief_requests SET status = 'COMPLETED', closed_at = NOW() WHERE id = ?`,
            [reliefRequestId]
          );
        }
      }

      await connection.commit();
      return {
        success: true,
        donationId: insertRes.insertId,
        newCurrentAmount: checkRows[0]?.current_amount || numAmount
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new ReliefRepository();
