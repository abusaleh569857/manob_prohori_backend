const { pool } = require('../config/db');

/**
 * Get all emergency services grouped with their contacts
 */
const getAllEmergencyServices = async (filters = {}) => {
  const { type, search, region, isAdmin = false } = filters;

  let query = `
    SELECT 
      es.id,
      es.name,
      es.service_type AS serviceType,
      es.description,
      es.is_active AS isActive,
      es.sort_order AS sortOrder
    FROM emergency_services es
    WHERE 1=1
  `;

  const params = [];

  if (!isAdmin) {
    query += ` AND es.is_active = TRUE`;
  }

  if (type && type !== 'ALL') {
    query += ` AND es.service_type = ?`;
    params.push(type);
  }

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    query += ` AND (es.name LIKE ? OR es.description LIKE ?)`;
    params.push(s, s);
  }

  query += ` ORDER BY es.sort_order ASC, es.name ASC`;

  const [services] = await pool.query(query, params);

  if (services.length === 0) return [];

  const serviceIds = services.map((s) => s.id);

  // Fetch contacts for these services
  let contactQuery = `
    SELECT 
      esc.id,
      esc.emergency_service_id AS emergencyServiceId,
      esc.region_name AS regionName,
      esc.phone_number AS phoneNumber,
      esc.display_label AS displayLabel,
      esc.is_primary AS isPrimary,
      esc.is_active AS isActive
    FROM emergency_service_contacts esc
    WHERE esc.emergency_service_id IN (?)
  `;

  const contactParams = [serviceIds];

  if (!isAdmin) {
    contactQuery += ` AND esc.is_active = TRUE`;
  }

  if (region && region.trim()) {
    contactQuery += ` AND (esc.region_name LIKE ? OR esc.region_name LIKE '%Nationwide%')`;
    contactParams.push(`%${region.trim()}%`);
  }

  contactQuery += ` ORDER BY esc.is_primary DESC, esc.region_name ASC`;

  const [contacts] = await pool.query(contactQuery, contactParams);

  const contactsMap = {};
  for (const c of contacts) {
    if (!contactsMap[c.emergencyServiceId]) contactsMap[c.emergencyServiceId] = [];
    contactsMap[c.emergencyServiceId].push({
      ...c,
      isPrimary: Boolean(c.isPrimary),
      isActive: Boolean(c.isActive),
    });
  }

  for (const s of services) {
    s.contacts = contactsMap[s.id] || [];
    s.isActive = Boolean(s.isActive);
  }

  return services;
};

/**
 * Get contacts for a specific emergency service
 */
const getServiceContacts = async (serviceId) => {
  const [rows] = await pool.query(`
    SELECT 
      id,
      emergency_service_id AS emergencyServiceId,
      region_name AS regionName,
      phone_number AS phoneNumber,
      display_label AS displayLabel,
      is_primary AS isPrimary,
      is_active AS isActive
    FROM emergency_service_contacts
    WHERE emergency_service_id = ?
    ORDER BY is_primary DESC, region_name ASC
  `, [serviceId]);

  return rows.map((r) => ({ ...r, isPrimary: Boolean(r.isPrimary), isActive: Boolean(r.isActive) }));
};

/**
 * Add a new contact to an emergency service (Admin)
 */
const createServiceContact = async (data) => {
  const { emergencyServiceId, regionName, phoneNumber, displayLabel, isPrimary = false } = data;

  const [res] = await pool.query(`
    INSERT INTO emergency_service_contacts (
      emergency_service_id, region_name, phone_number, display_label, is_primary, is_active
    ) VALUES (?, ?, ?, ?, ?, TRUE)
  `, [emergencyServiceId, regionName || null, phoneNumber, displayLabel || null, isPrimary ? 1 : 0]);

  return { id: res.insertId, ...data };
};

/**
 * Update emergency service contact (Admin)
 */
const updateServiceContact = async (id, data) => {
  const { regionName, phoneNumber, displayLabel, isPrimary, isActive } = data;

  await pool.query(`
    UPDATE emergency_service_contacts SET
      region_name = COALESCE(?, region_name),
      phone_number = COALESCE(?, phone_number),
      display_label = COALESCE(?, display_label),
      is_primary = CASE WHEN ? IS NOT NULL THEN ? ELSE is_primary END,
      is_active = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END
    WHERE id = ?
  `, [
    regionName, phoneNumber, displayLabel,
    isPrimary != null ? (isPrimary ? 1 : 0) : null,
    isPrimary != null ? (isPrimary ? 1 : 0) : null,
    isActive != null ? (isActive ? 1 : 0) : null,
    isActive != null ? (isActive ? 1 : 0) : null,
    id
  ]);

  return true;
};

/**
 * Delete emergency service contact (Admin)
 */
const deleteServiceContact = async (id) => {
  await pool.query('DELETE FROM emergency_service_contacts WHERE id = ?', [id]);
  return true;
};

module.exports = {
  getAllEmergencyServices,
  getServiceContacts,
  createServiceContact,
  updateServiceContact,
  deleteServiceContact,
};
