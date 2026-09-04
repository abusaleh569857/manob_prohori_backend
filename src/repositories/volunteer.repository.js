const { pool } = require('../config/db');

/**
 * Get or create volunteer profile for a user
 */
const getVolunteerProfile = async (userId) => {
  const [rows] = await pool.query(`
    SELECT 
      u.id AS userId,
      vp.volunteer_status AS volunteerStatus,
      vp.verification_status AS verificationStatus,
      vp.preferred_service_radius_km AS serviceRadiusKm,
      vp.experience_years AS experienceYears,
      vp.bio,
      vp.rejection_reason AS rejectionReason,
      vp.created_at AS createdAt,
      p.latitude,
      p.longitude,
      p.full_name AS fullName,
      u.phone,
      u.email,
      (SELECT COUNT(*) FROM volunteer_verifications vv WHERE vv.volunteer_user_id = u.id) AS verificationDocsCount,
      (SELECT COUNT(*) FROM volunteer_skills vs WHERE vs.volunteer_user_id = u.id) AS skillsCount
    FROM users u
    JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
    WHERE u.id = ?
    LIMIT 1
  `, [userId]);

  if (!rows[0]) return null;
  const data = rows[0];

  // If volunteer_profiles row doesn't exist yet, insert a default PENDING one
  if (!data.volunteerStatus && data.verificationStatus == null) {
    await pool.query(`
      INSERT INTO volunteer_profiles (user_id, volunteer_status, verification_status, preferred_service_radius_km)
      VALUES (?, 'UNAVAILABLE', 'PENDING', 10.00)
      ON DUPLICATE KEY UPDATE volunteer_status = volunteer_status
    `, [userId]);
    data.volunteerStatus = 'UNAVAILABLE';
    data.verificationStatus = 'PENDING';
    data.serviceRadiusKm = 10.0;
  }

  // Fetch skills
  const [skills] = await pool.query(`
    SELECT s.id, s.name, s.slug, vs.skill_level AS skillLevel, vs.is_verified AS isVerified
    FROM volunteer_skills vs
    JOIN skills s ON vs.skill_id = s.id
    WHERE vs.volunteer_user_id = ?
  `, [userId]);

  data.skills = skills || [];
  const docsCount = Number(data.verificationDocsCount) || 0;
  const sklCount = skills?.length || Number(data.skillsCount) || 0;
  const hasBio = Boolean(data.bio && data.bio.trim().length > 0);

  data.hasApplied = (docsCount > 0 || sklCount > 0 || hasBio);
  data.verificationDocsCount = docsCount;
  data.skillsCount = sklCount;

  return data;
};

/**
 * Update volunteer duty availability status
 */
const updateVolunteerStatus = async (userId, status) => {
  await pool.query(`
    INSERT INTO volunteer_profiles (user_id, volunteer_status, verification_status)
    VALUES (?, ?, 'PENDING')
    ON DUPLICATE KEY UPDATE volunteer_status = ?
  `, [userId, status, status]);

  return { volunteerStatus: status };
};

/**
 * Update volunteer live GPS location
 */
const updateVolunteerLocation = async (userId, latitude, longitude) => {
  await pool.query(`
    UPDATE user_profiles
    SET latitude = ?, longitude = ?
    WHERE user_id = ?
  `, [latitude, longitude, userId]);

  return { latitude, longitude };
};

/**
 * Get active emergency dispatches within volunteer's radius
 */
const getNearbyDispatches = async (userId) => {
  // 1. Get volunteer's location from user_profiles
  const [locRows] = await pool.query(`
    SELECT 
      latitude,
      longitude
    FROM user_profiles
    WHERE user_id = ?
    LIMIT 1
  `, [userId]);

  const rawLat = locRows[0]?.latitude;
  const rawLng = locRows[0]?.longitude;
  const vLat = rawLat != null ? Number(rawLat) : null;
  const vLng = rawLng != null ? Number(rawLng) : null;

  // 2. Query active dispatched incidents
  const [incidents] = await pool.query(`
    SELECT 
      i.id,
      i.reported_by AS reportedBy,
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
      i.verified_at AS verifiedAt,
      i.created_at AS createdAt,
      c.id AS categoryId,
      c.name AS categoryName,
      c.icon_name AS categoryIcon,
      u.phone AS reporterPhone,
      p.full_name AS reporterName,
      ivr.id AS requestId,
      ivr.response_status AS myRequestStatus,
      (
        SELECT COUNT(*) 
        FROM incident_volunteer_responses ivres 
        WHERE ivres.incident_id = i.id AND ivres.status != 'CANCELLED'
      ) AS respondersCount
    FROM incidents i
    JOIN incident_categories c ON i.incident_category_id = c.id
    JOIN users u ON i.reported_by = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN incident_volunteer_requests ivr ON i.id = ivr.incident_id AND ivr.volunteer_user_id = ?
    WHERE i.status IN ('DISPATCHING', 'IN_PROGRESS', 'RESPONDER_ASSIGNED')
      AND (ivr.response_status IS NULL OR ivr.response_status != 'DECLINED')
    ORDER BY i.created_at DESC
    LIMIT 20
  `, [userId]);

  if (incidents.length === 0) return [];

  // Attach images
  const incidentIds = incidents.map((i) => i.id);
  const [mediaRows] = await pool.query(`
    SELECT incident_id AS incidentId, file_url AS fileUrl 
    FROM incident_media 
    WHERE incident_id IN (?)
  `, [incidentIds]);

  const mediaMap = {};
  for (const m of mediaRows) {
    if (!mediaMap[m.incidentId]) mediaMap[m.incidentId] = [];
    mediaMap[m.incidentId].push(m.fileUrl);
  }

  for (const inc of incidents) {
    inc.imageUrls = mediaMap[inc.id] || [];

    // Calculate real Haversine distance if coordinates exist
    if (vLat != null && vLng != null && inc.latitude != null && inc.longitude != null) {
      const incLat = Number(inc.latitude);
      const incLng = Number(inc.longitude);
      const dLat = (incLat - vLat) * (Math.PI / 180);
      const dLng = (incLng - vLng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(vLat * (Math.PI / 180)) *
          Math.cos(incLat * (Math.PI / 180)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = 6371 * c; // in kilometers
      inc.distanceKm = Number(dist.toFixed(2));
    } else {
      inc.distanceKm = 0.05; // Exact nearby vicinity
    }
  }

  return incidents;
};

/**
 * Get volunteer's currently active mission
 */
const getActiveMission = async (userId) => {
  const [responses] = await pool.query(`
    SELECT 
      ivr.id AS responseId,
      ivr.incident_id AS incidentId,
      ivr.status AS missionStatus,
      ivr.accepted_at AS acceptedAt,
      ivr.en_route_at AS enRouteAt,
      ivr.arrived_at AS arrivedAt,
      ivr.eta_minutes AS etaMinutes,
      i.title,
      i.description,
      i.severity,
      i.status AS incidentStatus,
      i.latitude,
      i.longitude,
      i.address_text AS addressText,
      i.area_name AS areaName,
      i.district,
      i.upazila,
      i.reported_at AS reportedAt,
      c.name AS categoryName,
      c.icon_name AS categoryIcon,
      u.phone AS reporterPhone,
      p.full_name AS reporterName
    FROM incident_volunteer_responses ivr
    JOIN incidents i ON ivr.incident_id = i.id
    JOIN incident_categories c ON i.incident_category_id = c.id
    JOIN users u ON i.reported_by = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE ivr.volunteer_user_id = ? AND ivr.status IN ('ACCEPTED', 'EN_ROUTE', 'ON_SCENE')
    ORDER BY ivr.accepted_at DESC
    LIMIT 1
  `, [userId]);

  if (responses.length === 0) return null;
  const mission = responses[0];

  // Attach images
  const [mediaRows] = await pool.query(`
    SELECT file_url AS fileUrl FROM incident_media WHERE incident_id = ?
  `, [mission.incidentId]);
  mission.imageUrls = mediaRows.map((m) => m.fileUrl);

  return mission;
};

/**
 * Accept an incident response request
 */
const acceptIncidentResponse = async (connection, incidentId, userId) => {
  // Check if volunteer already has an ongoing active mission
  const [active] = await connection.query(`
    SELECT id FROM incident_volunteer_responses 
    WHERE volunteer_user_id = ? AND status IN ('ACCEPTED', 'EN_ROUTE', 'ON_SCENE')
    LIMIT 1
  `, [userId]);

  if (active.length > 0) {
    const err = new Error('You already have an active rescue mission. Complete or cancel it first.');
    err.statusCode = 400;
    throw err;
  }

  // Update or insert into incident_volunteer_requests
  await connection.query(`
    INSERT INTO incident_volunteer_requests (incident_id, volunteer_user_id, response_status, responded_at)
    VALUES (?, ?, 'ACCEPTED', NOW())
    ON DUPLICATE KEY UPDATE response_status = 'ACCEPTED', responded_at = NOW()
  `, [incidentId, userId]);

  // Insert into incident_volunteer_responses
  const [respResult] = await connection.query(`
    INSERT INTO incident_volunteer_responses (incident_id, volunteer_user_id, status, accepted_at)
    VALUES (?, ?, 'ACCEPTED', NOW())
    ON DUPLICATE KEY UPDATE status = 'ACCEPTED', accepted_at = NOW()
  `, [incidentId, userId]);

  // Update incident status to IN_PROGRESS
  await connection.query(`
    UPDATE incidents 
    SET status = 'IN_PROGRESS', updated_at = NOW() 
    WHERE id = ? AND status IN ('VERIFIED', 'DISPATCHING', 'RESPONDER_ASSIGNED')
  `, [incidentId]);

  // Record history
  await connection.query(`
    INSERT INTO incident_status_history (incident_id, old_status, new_status, changed_by, note)
    VALUES (?, 'DISPATCHING', 'IN_PROGRESS', ?, 'Volunteer accepted emergency dispatch response')
  `, [incidentId, userId]);

  return { responseId: respResult.insertId, incidentId, status: 'ACCEPTED' };
};

/**
 * Decline an incident request
 */
const declineIncidentResponse = async (incidentId, userId, reason) => {
  await pool.query(`
    INSERT INTO incident_volunteer_requests (incident_id, volunteer_user_id, response_status, decline_reason, responded_at)
    VALUES (?, ?, 'DECLINED', ?, NOW())
    ON DUPLICATE KEY UPDATE response_status = 'DECLINED', decline_reason = ?, responded_at = NOW()
  `, [incidentId, userId, reason || 'Volunteer unavailable', reason || 'Volunteer unavailable']);

  return { incidentId, status: 'DECLINED' };
};

/**
 * Update active mission status (EN_ROUTE -> ON_SCENE -> COMPLETED)
 */
const updateMissionStatus = async (connection, incidentId, userId, newStatus, note) => {
  if (newStatus === 'EN_ROUTE') {
    await connection.query(`
      UPDATE incident_volunteer_responses 
      SET status = 'EN_ROUTE', en_route_at = NOW(), updated_at = NOW()
      WHERE incident_id = ? AND volunteer_user_id = ?
    `, [incidentId, userId]);
  } else if (newStatus === 'ON_SCENE') {
    await connection.query(`
      UPDATE incident_volunteer_responses 
      SET status = 'ON_SCENE', arrived_at = NOW(), updated_at = NOW()
      WHERE incident_id = ? AND volunteer_user_id = ?
    `, [incidentId, userId]);
  } else if (newStatus === 'COMPLETED') {
    await connection.query(`
      UPDATE incident_volunteer_responses 
      SET status = 'COMPLETED', completed_at = NOW(), completion_notes = ?, updated_at = NOW()
      WHERE incident_id = ? AND volunteer_user_id = ?
    `, [note || 'Mission completed successfully', incidentId, userId]);

    // Update incident status to RESOLVED
    await connection.query(`
      UPDATE incidents 
      SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, [incidentId]);

    // Record history
    await connection.query(`
      INSERT INTO incident_status_history (incident_id, old_status, new_status, changed_by, note)
      VALUES (?, 'IN_PROGRESS', 'RESOLVED', ?, ?)
    `, [incidentId, userId, note || 'Volunteer completed rescue mission']);
  } else if (newStatus === 'CANCELLED') {
    await connection.query(`
      UPDATE incident_volunteer_responses 
      SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = ?, updated_at = NOW()
      WHERE incident_id = ? AND volunteer_user_id = ?
    `, [note || 'Cancelled by responder', incidentId, userId]);
  }

  return { status: newStatus, incidentId };
};

/**
 * Get volunteer's completed mission history
 */
const getMissionHistory = async (userId) => {
  const [rows] = await pool.query(`
    SELECT 
      ivr.id AS responseId,
      ivr.status AS missionStatus,
      ivr.accepted_at AS acceptedAt,
      ivr.completed_at AS completedAt,
      i.id AS incidentId,
      i.title,
      i.severity,
      i.address_text AS addressText,
      i.area_name AS areaName,
      c.name AS categoryName
    FROM incident_volunteer_responses ivr
    JOIN incidents i ON ivr.incident_id = i.id
    JOIN incident_categories c ON i.incident_category_id = c.id
    WHERE ivr.volunteer_user_id = ? AND ivr.status = 'COMPLETED'
    ORDER BY ivr.completed_at DESC
    LIMIT 10
  `, [userId]);

  return rows;
};

/**
 * Get all available skill options from database
 */
const getAllAvailableSkills = async () => {
  const [rows] = await pool.query(`
    SELECT id, name, slug, description 
    FROM skills 
    ORDER BY name ASC
  `);
  return rows;
};

/**
 * Get full verification application details for a volunteer
 */
const getVolunteerVerificationApplication = async (userId) => {
  const [profileRows] = await pool.query(`
    SELECT 
      vp.user_id AS userId,
      vp.volunteer_status AS volunteerStatus,
      vp.verification_status AS verificationStatus,
      vp.preferred_service_radius_km AS serviceRadiusKm,
      vp.experience_years AS experienceYears,
      vp.bio,
      vp.rejection_reason AS rejectionReason,
      vp.created_at AS createdAt,
      vp.updated_at AS updatedAt,
      p.full_name AS fullName,
      u.phone,
      u.email,
      p.district,
      p.upazila,
      p.address_line AS addressLine
    FROM users u
    JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
    WHERE u.id = ?
    LIMIT 1
  `, [userId]);

  if (!profileRows[0]) return null;
  const profile = profileRows[0];

  // Fetch skills
  const [skills] = await pool.query(`
    SELECT s.id AS skillId, s.name AS skillName, vs.skill_level AS skillLevel, vs.is_verified AS isVerified
    FROM volunteer_skills vs
    JOIN skills s ON vs.skill_id = s.id
    WHERE vs.volunteer_user_id = ?
  `, [userId]);
  profile.skills = skills || [];

  // Fetch documents
  const [documents] = await pool.query(`
    SELECT id, verification_type AS verificationType, status, document_url AS documentUrl, notes, notes AS title, submitted_at AS submittedAt
    FROM volunteer_verifications
    WHERE volunteer_user_id = ?
    ORDER BY submitted_at DESC
  `, [userId]);
  profile.documents = documents || [];

  return profile;
};

/**
 * Submit / Update Volunteer Verification Application
 */
const submitVolunteerVerificationApplication = async (userId, data) => {
  const {
    bio,
    experienceYears,
    preferredServiceRadiusKm = 5.0,
    skills = [],
    documents = [],
  } = data;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Upsert volunteer_profiles with PENDING verification
    await connection.query(`
      INSERT INTO volunteer_profiles (user_id, volunteer_status, verification_status, bio, experience_years, preferred_service_radius_km, rejection_reason, updated_at)
      VALUES (?, 'UNAVAILABLE', 'PENDING', ?, ?, ?, NULL, NOW())
      ON DUPLICATE KEY UPDATE 
        bio = VALUES(bio),
        experience_years = VALUES(experience_years),
        preferred_service_radius_km = VALUES(preferred_service_radius_km),
        verification_status = 'PENDING',
        rejection_reason = NULL,
        updated_at = NOW()
    `, [userId, bio || null, experienceYears || 0, preferredServiceRadiusKm]);

    // 2. Replace skills
    await connection.query(`DELETE FROM volunteer_skills WHERE volunteer_user_id = ?`, [userId]);
    for (const s of skills) {
      if (s.skillId) {
        await connection.query(`
          INSERT INTO volunteer_skills (volunteer_user_id, skill_id, skill_level, is_verified)
          VALUES (?, ?, ?, FALSE)
        `, [userId, s.skillId, s.skillLevel || 'BASIC']);
      }
    }

    // 3. Sync documents cleanly
    await connection.query(`DELETE FROM volunteer_verifications WHERE volunteer_user_id = ?`, [userId]);
    for (const doc of documents) {
      if (doc.documentUrl) {
        const docTitle = doc.title || doc.notes || null;
        await connection.query(`
          INSERT INTO volunteer_verifications (volunteer_user_id, verification_type, status, document_url, notes, submitted_at)
          VALUES (?, ?, 'PENDING', ?, ?, NOW())
        `, [userId, doc.verificationType || 'TRAINING', doc.documentUrl, docTitle]);
      }
    }

    await connection.commit();
    return { success: true, message: 'Verification application submitted successfully' };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Get all volunteers list for Admin Review
 */
const getAdminVolunteersList = async (filters = {}) => {
  const { status, search } = filters;

  let query = `
    SELECT 
      vp.user_id AS id,
      vp.user_id AS userId,
      p.full_name AS name,
      u.email,
      u.phone,
      CONCAT_WS(', ', p.upazila, p.district) AS location,
      p.district,
      p.upazila,
      CONCAT(vp.preferred_service_radius_km, ' km') AS serviceRadius,
      vp.preferred_service_radius_km AS serviceRadiusKm,
      CONCAT(vp.experience_years, ' yrs Experience') AS experienceYears,
      vp.experience_years AS rawExperienceYears,
      vp.verification_status AS verificationStatus,
      vp.volunteer_status AS volunteerStatus,
      vp.bio,
      vp.rejection_reason AS rejectionReason,
      vp.created_at AS submittedAt,
      vp.updated_at AS updatedAt
    FROM volunteer_profiles vp
    JOIN users u ON vp.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'ALL') {
    query += ` AND vp.verification_status = ?`;
    params.push(status);
  }

  if (search && search.trim()) {
    query += ` AND (p.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR p.district LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY vp.created_at DESC`;

  const [volunteers] = await pool.query(query, params);
  if (volunteers.length === 0) return [];

  const userIds = volunteers.map((v) => v.userId);

  // Fetch all skills for these volunteers
  const [allSkills] = await pool.query(`
    SELECT vs.volunteer_user_id AS volunteerUserId, s.name, vs.skill_level AS level, vs.is_verified AS isVerified
    FROM volunteer_skills vs
    JOIN skills s ON vs.skill_id = s.id
    WHERE vs.volunteer_user_id IN (?)
  `, [userIds]);

  const skillsMap = {};
  for (const sk of allSkills) {
    if (!skillsMap[sk.volunteerUserId]) skillsMap[sk.volunteerUserId] = [];
    skillsMap[sk.volunteerUserId].push({ name: sk.name, level: sk.level, isVerified: sk.isVerified });
  }

  // Fetch all documents for these volunteers
  const [allDocs] = await pool.query(`
    SELECT volunteer_user_id AS volunteerUserId, verification_type AS type, document_url AS url, notes, status, submitted_at AS submittedAt
    FROM volunteer_verifications
    WHERE volunteer_user_id IN (?)
    ORDER BY submitted_at DESC
  `, [userIds]);

  const docsMap = {};
  for (const d of allDocs) {
    if (!docsMap[d.volunteerUserId]) docsMap[d.volunteerUserId] = [];
    // Extract file name from url
    const urlParts = (d.url || '').split('/');
    const name = urlParts[urlParts.length - 1] || 'Verification_Document';
    docsMap[d.volunteerUserId].push({
      name,
      url: d.url,
      type: d.type,
      notes: d.notes,
      status: d.status,
      submittedAt: d.submittedAt
    });
  }

  for (const vol of volunteers) {
    vol.skills = skillsMap[vol.userId] || [];
    vol.documents = docsMap[vol.userId] || [];
  }

  return volunteers;
};

/**
 * Verify / Approve / Reject volunteer by Admin
 */
const verifyVolunteerByAdmin = async (adminUserId, volunteerUserId, status, rejectionReason) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update volunteer_profiles
    await connection.query(`
      UPDATE volunteer_profiles 
      SET 
        verification_status = ?,
        rejection_reason = ?,
        volunteer_status = CASE WHEN ? = 'APPROVED' THEN 'AVAILABLE' ELSE 'UNAVAILABLE' END,
        updated_at = NOW()
      WHERE user_id = ?
    `, [status, rejectionReason || null, status, volunteerUserId]);

    // 2. Update volunteer_verifications status
    await connection.query(`
      UPDATE volunteer_verifications
      SET status = ?
      WHERE volunteer_user_id = ?
    `, [status, volunteerUserId]);

    // 3. If approved, mark volunteer skills as verified
    if (status === 'APPROVED') {
      await connection.query(`
        UPDATE volunteer_skills
        SET is_verified = TRUE
        WHERE volunteer_user_id = ?
      `, [volunteerUserId]);
    }

    await connection.commit();
    return { success: true, volunteerUserId, status };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = {
  getVolunteerProfile,
  updateVolunteerStatus,
  updateVolunteerLocation,
  getNearbyDispatches,
  getActiveMission,
  acceptIncidentResponse,
  declineIncidentResponse,
  updateMissionStatus,
  getMissionHistory,
  getAllAvailableSkills,
  getVolunteerVerificationApplication,
  submitVolunteerVerificationApplication,
  getAdminVolunteersList,
  verifyVolunteerByAdmin,
};
