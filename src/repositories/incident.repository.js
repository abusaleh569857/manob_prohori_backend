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

  return result.insertId;
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

  return rows[0] || null;
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
  getMyIncidents,
  getIncidentById,
  getIncidentHistory,
  updateIncidentStatus,
};
