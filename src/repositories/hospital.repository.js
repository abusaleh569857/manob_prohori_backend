const { pool } = require('../config/db');

/**
 * Get all hospitals with flexible search, filtering, and GPS proximity
 */
const getAllHospitals = async (filters = {}) => {
  const {
    search,
    division,
    district,
    emergencyOnly,
    specialtyId,
    latitude,
    longitude,
    limit = 50,
    offset = 0,
    isAdmin = false,
  } = filters;

  const userLat = latitude != null && !isNaN(Number(latitude)) ? Number(latitude) : null;
  const userLng = longitude != null && !isNaN(Number(longitude)) ? Number(longitude) : null;

  let query = `
    SELECT 
      h.id,
      h.name,
      h.name_bn AS nameBn,
      h.facility_type AS facilityType,
      h.ownership,
      h.phone,
      h.email,
      h.address_text AS addressText,
      h.division,
      h.district,
      h.upazila,
      h.city,
      h.postal_code AS postalCode,
      h.latitude,
      h.longitude,
      h.emergency_available AS emergencyAvailable,
      h.is_active AS isActive,
      h.created_at AS createdAt,
      h.updated_at AS updatedAt
  `;

  // Haversine distance formula if user coordinates are provided
  if (userLat != null && userLng != null) {
    query += `,
      ROUND(6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(h.latitude - ?)/2), 2) +
        COS(RADIANS(?)) * COS(RADIANS(h.latitude)) *
        POWER(SIN(RADIANS(h.longitude - ?)/2), 2)
      )), 2) AS distanceKm
    `;
  } else {
    query += `, NULL AS distanceKm`;
  }

  query += `
    FROM hospitals h
    WHERE 1=1
  `;

  const params = [];
  if (userLat != null && userLng != null) {
    params.push(userLat, userLat, userLng);
  }

  // Non-admins only see active hospitals
  if (!isAdmin) {
    query += ` AND h.is_active = TRUE`;
  }

  // Search filter (name, bangla name, address, district)
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    query += ` AND (h.name LIKE ? OR h.name_bn LIKE ? OR h.address_text LIKE ? OR h.district LIKE ? OR h.upazila LIKE ?)`;
    params.push(s, s, s, s, s);
  }

  // Division filter
  if (division && division !== 'ALL') {
    query += ` AND h.division = ?`;
    params.push(division);
  }

  // District filter
  if (district && district !== 'ALL') {
    query += ` AND h.district = ?`;
    params.push(district);
  }

  // Emergency 24/7 filter
  if (emergencyOnly === 'true' || emergencyOnly === true) {
    query += ` AND h.emergency_available = TRUE`;
  }

  // Specialty filter
  if (specialtyId && !isNaN(Number(specialtyId))) {
    query += ` AND h.id IN (SELECT hospital_id FROM hospital_specialties WHERE specialty_id = ?)`;
    params.push(Number(specialtyId));
  }

  // Ordering
  if (userLat != null && userLng != null) {
    query += ` ORDER BY CASE WHEN h.latitude IS NOT NULL THEN 0 ELSE 1 END, distanceKm ASC, h.name ASC`;
  } else {
    query += ` ORDER BY h.emergency_available DESC, h.name ASC`;
  }

  query += ` LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const [hospitals] = await pool.query(query, params);

  if (hospitals.length === 0) return [];

  const hospitalIds = hospitals.map((h) => h.id);

  // Fetch specialties for these hospitals
  const [specialties] = await pool.query(`
    SELECT hs.hospital_id AS hospitalId, s.id, s.name, s.slug
    FROM hospital_specialties hs
    JOIN specialties s ON hs.specialty_id = s.id
    WHERE hs.hospital_id IN (?) AND s.is_active = TRUE
  `, [hospitalIds]);

  const specialtiesMap = {};
  for (const s of specialties) {
    if (!specialtiesMap[s.hospitalId]) specialtiesMap[s.hospitalId] = [];
    specialtiesMap[s.hospitalId].push({ id: s.id, name: s.name, slug: s.slug });
  }

  // Fetch services for these hospitals
  const [services] = await pool.query(`
    SELECT hospital_id AS hospitalId, id, service_name AS serviceName, phone, is_available AS isAvailable, notes
    FROM hospital_services
    WHERE hospital_id IN (?) AND is_available = TRUE
  `, [hospitalIds]);

  const servicesMap = {};
  for (const s of services) {
    if (!servicesMap[s.hospitalId]) servicesMap[s.hospitalId] = [];
    servicesMap[s.hospitalId].push(s);
  }

  // Combine
  for (const h of hospitals) {
    h.specialties = specialtiesMap[h.id] || [];
    h.services = servicesMap[h.id] || [];
    h.emergencyAvailable = Boolean(h.emergencyAvailable);
    h.isActive = Boolean(h.isActive);
    if (h.distanceKm != null) {
      h.distanceKm = Number(h.distanceKm);
    }
    if (h.latitude != null) h.latitude = Number(h.latitude);
    if (h.longitude != null) h.longitude = Number(h.longitude);
  }

  return hospitals;
};

/**
 * Get single hospital by ID with complete details
 */
const getHospitalById = async (id) => {
  const [rows] = await pool.query(`
    SELECT 
      h.id,
      h.name,
      h.name_bn AS nameBn,
      h.facility_type AS facilityType,
      h.ownership,
      h.phone,
      h.email,
      h.address_text AS addressText,
      h.division,
      h.district,
      h.upazila,
      h.city,
      h.postal_code AS postalCode,
      h.latitude,
      h.longitude,
      h.emergency_available AS emergencyAvailable,
      h.is_active AS isActive,
      h.created_at AS createdAt,
      h.updated_at AS updatedAt
    FROM hospitals h
    WHERE h.id = ?
    LIMIT 1
  `, [id]);

  if (!rows[0]) return null;
  const hospital = rows[0];

  // Fetch specialties
  const [specialties] = await pool.query(`
    SELECT s.id, s.name, s.slug
    FROM hospital_specialties hs
    JOIN specialties s ON hs.specialty_id = s.id
    WHERE hs.hospital_id = ? AND s.is_active = TRUE
  `, [id]);
  hospital.specialties = specialties;

  // Fetch services
  const [services] = await pool.query(`
    SELECT id, service_name AS serviceName, phone, is_available AS isAvailable, notes
    FROM hospital_services
    WHERE hospital_id = ?
  `, [id]);
  hospital.services = services;

  hospital.emergencyAvailable = Boolean(hospital.emergencyAvailable);
  hospital.isActive = Boolean(hospital.isActive);
  if (hospital.latitude != null) hospital.latitude = Number(hospital.latitude);
  if (hospital.longitude != null) hospital.longitude = Number(hospital.longitude);

  return hospital;
};

/**
 * Create a new hospital (Admin)
 */
const createHospital = async (connection, data) => {
  const {
    name,
    nameBn,
    facilityType = 'General Hospital',
    ownership = 'Government',
    phone,
    email,
    addressText,
    division,
    district,
    upazila,
    city,
    postalCode,
    latitude,
    longitude,
    emergencyAvailable = true,
    specialtyIds = [],
    services = [],
  } = data;

  const [result] = await connection.query(`
    INSERT INTO hospitals (
      name, name_bn, facility_type, ownership, phone, email,
      address_text, division, district, upazila, city, postal_code,
      latitude, longitude, emergency_available, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())
  `, [
    name, nameBn || null, facilityType, ownership, phone, email || null,
    addressText, division, district, upazila || null, city || null, postalCode || null,
    latitude != null ? Number(latitude) : null,
    longitude != null ? Number(longitude) : null,
    emergencyAvailable === true || emergencyAvailable === 'true' ? 1 : 0
  ]);

  const hospitalId = result.insertId;

  // Insert specialties
  if (Array.isArray(specialtyIds) && specialtyIds.length > 0) {
    for (const specId of specialtyIds) {
      await connection.query(`
        INSERT IGNORE INTO hospital_specialties (hospital_id, specialty_id)
        VALUES (?, ?)
      `, [hospitalId, specId]);
    }
  }

  // Insert services
  if (Array.isArray(services) && services.length > 0) {
    for (const s of services) {
      if (s.serviceName) {
        await connection.query(`
          INSERT INTO hospital_services (hospital_id, service_name, phone, is_available, notes)
          VALUES (?, ?, ?, ?, ?)
        `, [hospitalId, s.serviceName, s.phone || phone || null, s.isAvailable !== false ? 1 : 0, s.notes || null]);
      }
    }
  }

  return hospitalId;
};

/**
 * Update hospital details (Admin)
 */
const updateHospital = async (connection, id, data) => {
  const {
    name,
    nameBn,
    facilityType,
    ownership,
    phone,
    email,
    addressText,
    division,
    district,
    upazila,
    city,
    postalCode,
    latitude,
    longitude,
    emergencyAvailable,
    isActive,
    specialtyIds,
    services,
  } = data;

  await connection.query(`
    UPDATE hospitals SET
      name = COALESCE(?, name),
      name_bn = COALESCE(?, name_bn),
      facility_type = COALESCE(?, facility_type),
      ownership = COALESCE(?, ownership),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      address_text = COALESCE(?, address_text),
      division = COALESCE(?, division),
      district = COALESCE(?, district),
      upazila = COALESCE(?, upazila),
      city = COALESCE(?, city),
      postal_code = COALESCE(?, postal_code),
      latitude = CASE WHEN ? IS NOT NULL THEN ? ELSE latitude END,
      longitude = CASE WHEN ? IS NOT NULL THEN ? ELSE longitude END,
      emergency_available = CASE WHEN ? IS NOT NULL THEN ? ELSE emergency_available END,
      is_active = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END,
      updated_at = NOW()
    WHERE id = ?
  `, [
    name, nameBn, facilityType, ownership, phone, email,
    addressText, division, district, upazila, city, postalCode,
    latitude, latitude, longitude, longitude,
    emergencyAvailable != null ? (emergencyAvailable === true || emergencyAvailable === 'true' ? 1 : 0) : null,
    emergencyAvailable != null ? (emergencyAvailable === true || emergencyAvailable === 'true' ? 1 : 0) : null,
    isActive != null ? (isActive === true || isActive === 'true' ? 1 : 0) : null,
    isActive != null ? (isActive === true || isActive === 'true' ? 1 : 0) : null,
    id
  ]);

  // Sync specialties if provided
  if (Array.isArray(specialtyIds)) {
    await connection.query('DELETE FROM hospital_specialties WHERE hospital_id = ?', [id]);
    for (const specId of specialtyIds) {
      await connection.query(`
        INSERT IGNORE INTO hospital_specialties (hospital_id, specialty_id)
        VALUES (?, ?)
      `, [id, specId]);
    }
  }

  // Sync services if provided
  if (Array.isArray(services)) {
    await connection.query('DELETE FROM hospital_services WHERE hospital_id = ?', [id]);
    for (const s of services) {
      if (s.serviceName) {
        await connection.query(`
          INSERT INTO hospital_services (hospital_id, service_name, phone, is_available, notes)
          VALUES (?, ?, ?, ?, ?)
        `, [id, s.serviceName, s.phone || phone || null, s.isAvailable !== false ? 1 : 0, s.notes || null]);
      }
    }
  }

  return true;
};

/**
 * Toggle hospital active status
 */
const toggleHospitalStatus = async (id) => {
  await pool.query(`
    UPDATE hospitals 
    SET is_active = NOT is_active, updated_at = NOW()
    WHERE id = ?
  `, [id]);

  const [updated] = await pool.query('SELECT id, is_active AS isActive FROM hospitals WHERE id = ?', [id]);
  return updated[0];
};

/**
 * Delete a hospital
 */
const deleteHospital = async (id) => {
  await pool.query('DELETE FROM hospitals WHERE id = ?', [id]);
  return true;
};

/**
 * Get all available specialties for filters and assignment
 */
const getAllSpecialties = async () => {
  const [rows] = await pool.query(`
    SELECT id, name, slug, is_active AS isActive
    FROM specialties
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);
  return rows;
};

module.exports = {
  getAllHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  toggleHospitalStatus,
  deleteHospital,
  getAllSpecialties,
};
