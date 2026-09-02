const { pool } = require('../config/db');

const createIncident = async (connection, incidentData) => {
  const {
    incidentCategoryId,
    reportedBy,
    title,
    description,
    severity,
    latitude,
    longitude,
    locationAccuracyMeters,
    addressText,
    areaName,
    district,
    upazila,
    imageUrls,
  } = incidentData;

  const [result] = await connection.query(`
    INSERT INTO incidents (
      incident_category_id,
      reported_by,
      title,
      description,
      severity,
      status,
      latitude,
      longitude,
      location_accuracy_meters,
      address_text,
      area_name,
      district,
      upazila,
      reported_at
    ) VALUES (?, ?, ?, ?, ?, 'REPORTED', ?, ?, ?, ?, ?, ?, ?, NOW())
  `, [
    incidentCategoryId,
    reportedBy,
    title,
    description,
    severity,
    latitude,
    longitude,
    locationAccuracyMeters || null,
    addressText || null,
    areaName || null,
    district || null,
    upazila || null,
  ]);

  const incidentId = result.insertId;

  // Save attached photos to incident_media table
  if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
    const mediaValues = imageUrls.map((url) => [
      incidentId,
      'IMAGE',
      url,
      reportedBy,
    ]);

    await connection.query(`
      INSERT INTO incident_media (
        incident_id,
        media_type,
        file_url,
        uploaded_by
      ) VALUES ?
    `, [mediaValues]);
  }

  return incidentId;
};

const createStatusHistory = async (connection, historyData) => {
  const { incidentId, oldStatus, newStatus, changedBy, note } = historyData;

  const [result] = await connection.query(`
    INSERT INTO incident_status_history (
      incident_id,
      old_status,
      new_status,
      changed_by,
      note,
      created_at
    ) VALUES (?, ?, ?, ?, ?, NOW())
  `, [
    incidentId,
    oldStatus || null,
    newStatus,
    changedBy || null,
    note || null,
  ]);

  return result.insertId;
};

const getAllIncidents = async ({ status, severity, search, limit = 50, page = 1 } = {}) => {
  let query = `
    SELECT 
      i.id,
      i.reported_by AS reportedBy,
      i.title,
      i.description,
      i.severity,
      i.status,
      i.latitude,
      i.longitude,
      i.location_accuracy_meters AS locationAccuracyMeters,
      i.address_text AS addressText,
      i.area_name AS areaName,
      i.district,
      i.upazila,
      i.incident_started_at AS incidentStartedAt,
      i.reported_at AS reportedAt,
      i.verified_at AS verifiedAt,
      i.resolved_at AS resolvedAt,
      i.created_at AS createdAt,
      i.updated_at AS updatedAt,
      c.id AS categoryId,
      c.name AS categoryName,
      c.slug AS categorySlug,
      c.icon_name AS categoryIcon,
      u.phone AS reporterPhone,
      u.email AS reporterEmail,
      p.full_name AS reporterName,
      (
        SELECT COUNT(*) 
        FROM incident_volunteer_requests ivr 
        WHERE ivr.incident_id = i.id AND ivr.response_status = 'ACCEPTED'
      ) AS respondersDispatched
    FROM incidents i
    JOIN incident_categories c ON i.incident_category_id = c.id
    JOIN users u ON i.reported_by = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'ALL') {
    if (status === 'VERIFIED_ONLY') {
      query += ` AND i.status IN ('VERIFIED', 'DISPATCHING', 'IN_PROGRESS', 'RESPONDER_ASSIGNED') AND i.status != 'REPORTED' AND i.status != 'REJECTED' AND i.status != 'CANCELLED'`;
    } else if (status === 'DISPATCHING') {
      query += ` AND (i.status = 'DISPATCHING' OR i.status = 'IN_PROGRESS' OR i.status = 'RESPONDER_ASSIGNED')`;
    } else {
      query += ` AND i.status = ?`;
      params.push(status);
    }
  }

  if (severity) {
    query += ` AND i.severity = ?`;
    params.push(severity);
  }

  if (search) {
    query += ` AND (i.title LIKE ? OR i.address_text LIKE ? OR i.area_name LIKE ? OR p.full_name LIKE ? OR u.phone LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }

  query += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), Number(offset));

  const [rows] = await pool.query(query, params);

  // Attach images
  if (rows.length > 0) {
    const incidentIds = rows.map((r) => r.id);
    const [mediaRows] = await pool.query(
      `SELECT incident_id AS incidentId, file_url AS fileUrl FROM incident_media WHERE incident_id IN (?)`,
      [incidentIds]
    );

    const mediaMap = {};
    for (const m of mediaRows) {
      if (!mediaMap[m.incidentId]) mediaMap[m.incidentId] = [];
      mediaMap[m.incidentId].push(m.fileUrl);
    }

    for (const r of rows) {
      r.imageUrls = mediaMap[r.id] || [];
    }
  }

  return rows;
};

const getAdminOverviewStats = async () => {
  const [[counts]] = await pool.query(`
    SELECT 
      COUNT(*) AS totalIncidents,
      SUM(CASE WHEN status = 'REPORTED' THEN 1 ELSE 0 END) AS pendingVerification,
      SUM(CASE WHEN status IN ('DISPATCHING', 'IN_PROGRESS', 'RESPONDER_ASSIGNED') THEN 1 ELSE 0 END) AS activeDispatches,
      SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolvedIncidents,
      SUM(CASE WHEN severity = 'CRITICAL' AND status != 'RESOLVED' AND status != 'REJECTED' THEN 1 ELSE 0 END) AS criticalActive
    FROM incidents
  `);

  const [[userCounts]] = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM volunteer_profiles WHERE verification_status = 'APPROVED') AS verifiedVolunteers,
      (SELECT COUNT(*) FROM blood_donor_profiles WHERE verification_status = 'VERIFIED') AS verifiedDonors,
      (SELECT COUNT(*) FROM hospitals) AS totalHospitals
  `);

  const [categoryBreakdown] = await pool.query(`
    SELECT c.name AS categoryName, COUNT(i.id) AS count
    FROM incident_categories c
    LEFT JOIN incidents i ON c.id = i.incident_category_id
    GROUP BY c.id, c.name
    ORDER BY count DESC
    LIMIT 6
  `);

  const [severityDistribution] = await pool.query(`
    SELECT severity, COUNT(*) AS count
    FROM incidents
    GROUP BY severity
  `);

  return {
    metrics: {
      totalIncidents: Number(counts?.totalIncidents || 0),
      pendingVerification: Number(counts?.pendingVerification || 0),
      activeDispatches: Number(counts?.activeDispatches || 0),
      resolvedIncidents: Number(counts?.resolvedIncidents || 0),
      criticalActive: Number(counts?.criticalActive || 0),
      verifiedVolunteers: Number(userCounts?.verifiedVolunteers || 0),
      verifiedDonors: Number(userCounts?.verifiedDonors || 0),
      totalHospitals: Number(userCounts?.totalHospitals || 0),
    },
    categoryBreakdown: categoryBreakdown || [],
    severityDistribution: severityDistribution || [],
  };
};

const getMyIncidents = async (userId) => {
  const [rows] = await pool.query(`
    SELECT 
      i.id,
      i.title,
      i.description,
      i.severity,
      i.status,
      i.latitude,
      i.longitude,
      i.address_text AS addressText,
      i.area_name AS areaName,
      i.district,
      i.upazila,
      i.reported_at AS reportedAt,
      i.created_at AS createdAt,
      c.id AS categoryId,
      c.name AS categoryName,
      c.icon_name AS categoryIcon
    FROM incidents i
    JOIN incident_categories c ON i.incident_category_id = c.id
    WHERE i.reported_by = ?
    ORDER BY i.created_at DESC
  `, [userId]);

  return rows;
};

const getIncidentById = async (id) => {
  const [rows] = await pool.query(`
    SELECT 
      i.id,
      i.reported_by AS reportedBy,
      i.title,
      i.description,
      i.severity,
      i.status,
      i.latitude,
      i.longitude,
      i.location_accuracy_meters AS locationAccuracyMeters,
      i.address_text AS addressText,
      i.area_name AS areaName,
      i.district,
      i.upazila,
      i.incident_started_at AS incidentStartedAt,
      i.reported_at AS reportedAt,
      i.verified_at AS verifiedAt,
      i.resolved_at AS resolvedAt,
      i.created_at AS createdAt,
      i.updated_at AS updatedAt,
      c.id AS categoryId,
      c.name AS categoryName,
      c.slug AS categorySlug,
      c.icon_name AS categoryIcon,
      u.phone AS reporterPhone,
      u.email AS reporterEmail,
      p.full_name AS reporterName
    FROM incidents i
    JOIN incident_categories c ON i.incident_category_id = c.id
    JOIN users u ON i.reported_by = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE i.id = ?
    LIMIT 1
  `, [id]);

  if (!rows[0]) return null;

  const incident = rows[0];

  // Fetch attached media
  const [mediaRows] = await pool.query(`
    SELECT file_url AS fileUrl, media_type AS mediaType
    FROM incident_media
    WHERE incident_id = ?
    ORDER BY id ASC
  `, [id]);

  incident.imageUrls = mediaRows.map((m) => m.fileUrl);

  return incident;
};

const getIncidentHistory = async (incidentId) => {
  const [rows] = await pool.query(`
    SELECT 
      h.id,
      h.incident_id AS incidentId,
      h.old_status AS oldStatus,
      h.new_status AS newStatus,
      h.note,
      h.created_at AS createdAt,
      h.changed_by AS changedBy,
      p.full_name AS changedByName,
      u.phone AS changedByPhone
    FROM incident_status_history h
    LEFT JOIN users u ON h.changed_by = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE h.incident_id = ?
    ORDER BY h.created_at ASC
  `, [incidentId]);

  return rows;
};

const updateIncidentStatus = async (connection, incidentId, newStatus, changedBy, note) => {
  const [current] = await connection.query(`
    SELECT status FROM incidents WHERE id = ? FOR UPDATE
  `, [incidentId]);

  if (!current.length) {
    throw new Error('Incident not found');
  }

  const oldStatus = current[0].status;

  await connection.query(`
    UPDATE incidents 
    SET 
      status = ?, 
      updated_at = NOW(),
      verified_at = CASE WHEN ? = 'VERIFIED' AND verified_at IS NULL THEN NOW() ELSE verified_at END,
      verified_by = CASE WHEN ? = 'VERIFIED' AND verified_by IS NULL THEN ? ELSE verified_by END,
      resolved_at = CASE WHEN ? = 'RESOLVED' THEN NOW() ELSE resolved_at END,
      resolved_by = CASE WHEN ? = 'RESOLVED' THEN ? ELSE resolved_by END
    WHERE id = ?
  `, [
    newStatus, 
    newStatus, 
    newStatus, changedBy || null,
    newStatus, 
    newStatus, changedBy || null,
    incidentId
  ]);

  await createStatusHistory(connection, {
    incidentId,
    oldStatus,
    newStatus,
    changedBy,
    note: note || `Status updated from ${oldStatus} to ${newStatus}`,
  });

  return { oldStatus, newStatus };
};

module.exports = {
  createIncident,
  createStatusHistory,
  getAllIncidents,
  getAdminOverviewStats,
  getMyIncidents,
  getIncidentById,
  getIncidentHistory,
  updateIncidentStatus,
};
