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
      (SELECT COUNT(*) FROM volunteer_profiles WHERE verification_status = 'PENDING') AS pendingVolunteers,
      (SELECT COUNT(*) FROM blood_donor_profiles WHERE verification_status IN ('VERIFIED', 'APPROVED')) AS verifiedDonors,
      (SELECT COUNT(*) FROM blood_donor_profiles WHERE verification_status = 'PENDING') AS pendingDonors,
      (SELECT COUNT(*) FROM hospitals) AS totalHospitals
  `);

  const [categoryBreakdown] = await pool.query(`
    SELECT c.name AS categoryName, COUNT(i.id) AS count
    FROM incident_categories c
    LEFT JOIN incidents i ON c.id = i.incident_category_id
    GROUP BY c.id, c.name, c.sort_order
    ORDER BY c.sort_order ASC, c.id ASC
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
      pendingVolunteers: Number(userCounts?.pendingVolunteers || 0),
      verifiedDonors: Number(userCounts?.verifiedDonors || 0),
      pendingDonors: Number(userCounts?.pendingDonors || 0),
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

/**
 * Get nearby verified volunteers for an incident within a specific radius (km)
 */
const getNearbyVolunteersForIncident = async (incidentId, radiusKm = 5.0) => {
  // 1. Get incident location
  const [incRows] = await pool.query(`
    SELECT id, title, latitude, longitude, address_text AS addressText, area_name AS areaName, district, upazila, status
    FROM incidents
    WHERE id = ?
    LIMIT 1
  `, [incidentId]);

  if (!incRows[0]) {
    const error = new Error('Incident not found');
    error.statusCode = 404;
    throw error;
  }

  const incident = incRows[0];
  const incLat = incident.latitude != null ? Number(incident.latitude) : 23.8103; // Fallback to Dhaka
  const incLng = incident.longitude != null ? Number(incident.longitude) : 90.4125;

  // 2. Fetch all approved volunteers with their locations
  const [volunteers] = await pool.query(`
    SELECT 
      u.id AS userId,
      p.full_name AS name,
      u.phone,
      u.email,
      p.district,
      p.upazila,
      p.latitude,
      p.longitude,
      vp.volunteer_status AS volunteerStatus,
      vp.verification_status AS verificationStatus,
      vp.preferred_service_radius_km AS serviceRadiusKm,
      vp.experience_years AS experienceYears,
      vp.bio,
      ivr.response_status AS dispatchStatus,
      ivr.responded_at AS dispatchRespondedAt
    FROM volunteer_profiles vp
    JOIN users u ON vp.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN incident_volunteer_requests ivr ON ivr.incident_id = ? AND ivr.volunteer_user_id = u.id
    WHERE vp.verification_status = 'APPROVED'
  `, [incidentId]);

  if (volunteers.length === 0) return { incident, radiusKm, volunteers: [] };

  // 3. Fetch skills for these volunteers
  const userIds = volunteers.map((v) => v.userId);
  const [allSkills] = await pool.query(`
    SELECT vs.volunteer_user_id AS volunteerUserId, s.name, vs.skill_level AS level
    FROM volunteer_skills vs
    JOIN skills s ON vs.skill_id = s.id
    WHERE vs.volunteer_user_id IN (?)
  `, [userIds]);

  const skillsMap = {};
  for (const sk of allSkills) {
    if (!skillsMap[sk.volunteerUserId]) skillsMap[sk.volunteerUserId] = [];
    skillsMap[sk.volunteerUserId].push({ name: sk.name, level: sk.level });
  }

  // 4. Calculate exact Haversine distance for each volunteer
  const calculatedVolunteers = volunteers.map((vol) => {
    let distanceKm = 0.5; // Default nearby estimate if coordinates unpopulated
    const vLat = vol.latitude != null ? Number(vol.latitude) : null;
    const vLng = vol.longitude != null ? Number(vol.longitude) : null;

    if (vLat != null && vLng != null && !isNaN(vLat) && !isNaN(vLng)) {
      const dLat = (vLat - incLat) * (Math.PI / 180);
      const dLng = (vLng - incLng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(incLat * (Math.PI / 180)) *
          Math.cos(vLat * (Math.PI / 180)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceKm = Number((6371 * c).toFixed(2));
    } else {
      // Same district / upazila rough estimate
      if (vol.district && incident.district && vol.district.toLowerCase() === incident.district.toLowerCase()) {
        distanceKm = 2.5;
      } else {
        distanceKm = 4.8;
      }
    }

    return {
      userId: vol.userId,
      name: vol.name,
      phone: vol.phone,
      email: vol.email,
      district: vol.district,
      upazila: vol.upazila,
      volunteerStatus: vol.volunteerStatus || 'AVAILABLE',
      verificationStatus: vol.verificationStatus,
      serviceRadiusKm: vol.serviceRadiusKm || 10,
      experienceYears: vol.experienceYears,
      distanceKm,
      isWithinRadius: distanceKm <= radiusKm,
      isDispatched: Boolean(vol.dispatchStatus),
      dispatchStatus: vol.dispatchStatus || null,
      skills: skillsMap[vol.userId] || [],
    };
  });

  // Sort: First within radius, then by distance ascending, then ON-DUTY first
  calculatedVolunteers.sort((a, b) => {
    if (a.isWithinRadius !== b.isWithinRadius) return a.isWithinRadius ? -1 : 1;
    if (a.volunteerStatus === 'AVAILABLE' && b.volunteerStatus !== 'AVAILABLE') return -1;
    if (a.volunteerStatus !== 'AVAILABLE' && b.volunteerStatus === 'AVAILABLE') return 1;
    return a.distanceKm - b.distanceKm;
  });

  return {
    incident,
    radiusKm,
    totalVolunteersCount: calculatedVolunteers.length,
    matchedWithinRadiusCount: calculatedVolunteers.filter((v) => v.isWithinRadius).length,
    volunteers: calculatedVolunteers,
  };
};

/**
 * Dispatch emergency incident alerts to selected or all nearby volunteers
 */
const dispatchIncidentToVolunteers = async (incidentId, volunteerUserIds, adminUserId, note) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch current status
    const [incRows] = await connection.query('SELECT status FROM incidents WHERE id = ?', [incidentId]);
    const currentStatus = incRows[0]?.status || 'REPORTED';

    // 2. Update incident status to DISPATCHING
    await connection.query(`
      UPDATE incidents
      SET status = 'DISPATCHING', updated_at = NOW()
      WHERE id = ?
    `, [incidentId]);

    // 3. Record in incident_status_history
    await connection.query(`
      INSERT INTO incident_status_history (incident_id, old_status, new_status, changed_by, note, created_at)
      VALUES (?, ?, 'DISPATCHING', ?, ?, NOW())
    `, [incidentId, currentStatus, adminUserId || null, note || `Emergency alert broadcast dispatched to ${volunteerUserIds.length} nearby responders`]);

    // 4. Batch insert / update incident_volunteer_requests with PENDING status
    for (const vUserId of volunteerUserIds) {
      await connection.query(`
        INSERT INTO incident_volunteer_requests (incident_id, volunteer_user_id, response_status)
        VALUES (?, ?, 'PENDING')
        ON DUPLICATE KEY UPDATE response_status = 'PENDING'
      `, [incidentId, vUserId]);
    }

    await connection.commit();
    return {
      success: true,
      incidentId,
      dispatchedCount: volunteerUserIds.length,
      message: `Emergency alert broadcast successfully sent to ${volunteerUserIds.length} volunteer responders!`,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Get all dispatched responders / requests for an incident
 */
const getIncidentDispatchedResponders = async (incidentId) => {
  const [rows] = await pool.query(`
    SELECT 
      ivr.id AS requestId,
      ivr.volunteer_user_id AS volunteerUserId,
      ivr.response_status AS requestStatus,
      ivr.responded_at AS respondedAt,
      ivr.decline_reason AS declineReason,
      res.id AS responseId,
      res.status AS missionStatus,
      res.accepted_at AS acceptedAt,
      res.en_route_at AS enRouteAt,
      res.arrived_at AS arrivedAt,
      res.completed_at AS completedAt,
      p.full_name AS volunteerName,
      u.phone AS volunteerPhone,
      u.email AS volunteerEmail,
      COALESCE(vp.volunteer_status, 'AVAILABLE') AS dutyStatus
    FROM incident_volunteer_requests ivr
    JOIN users u ON ivr.volunteer_user_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN volunteer_profiles vp ON u.id = vp.user_id
    LEFT JOIN incident_volunteer_responses res ON res.incident_id = ivr.incident_id AND res.volunteer_user_id = ivr.volunteer_user_id
    WHERE ivr.incident_id = ?
    ORDER BY ivr.created_at DESC
  `, [incidentId]);

  return rows;
};

/**
 * Get full nationwide crisis telemetry, incident clusters, volunteer density & division stats
 */
const getNationalCrisisTelemetry = async () => {
  // 1. Fetch all active & recent incidents with coordinates
  const [incidents] = await pool.query(`
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
      c.icon_name AS categoryIcon,
      u.phone AS reporterPhone,
      p.full_name AS reporterName,
      (
        SELECT COUNT(*) 
        FROM incident_volunteer_responses ivr 
        WHERE ivr.incident_id = i.id AND ivr.status != 'CANCELLED'
      ) AS respondersCount
    FROM incidents i
    JOIN incident_categories c ON i.incident_category_id = c.id
    JOIN users u ON i.reported_by = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
    ORDER BY i.created_at DESC
    LIMIT 150
  `);

  // Attach first media image if available
  if (incidents.length > 0) {
    const incIds = incidents.map((i) => i.id);
    const [media] = await pool.query(`
      SELECT incident_id AS incidentId, file_url AS fileUrl 
      FROM incident_media 
      WHERE incident_id IN (?)
    `, [incIds]);
    const mediaMap = {};
    for (const m of media) {
      if (!mediaMap[m.incidentId]) mediaMap[m.incidentId] = [];
      mediaMap[m.incidentId].push(m.fileUrl);
    }
    for (const inc of incidents) {
      inc.imageUrls = mediaMap[inc.id] || [];
      inc.latitude = Number(inc.latitude);
      inc.longitude = Number(inc.longitude);
      inc.respondersCount = Number(inc.respondersCount || 0);
    }
  }

  // 2. Fetch all verified volunteers with locations
  const [volunteers] = await pool.query(`
    SELECT 
      u.id AS userId,
      p.full_name AS name,
      u.phone,
      p.district,
      p.upazila,
      p.latitude,
      p.longitude,
      vp.volunteer_status AS volunteerStatus,
      vp.preferred_service_radius_km AS serviceRadiusKm
    FROM volunteer_profiles vp
    JOIN users u ON vp.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE vp.verification_status = 'APPROVED'
      AND p.latitude IS NOT NULL 
      AND p.longitude IS NOT NULL
  `);

  for (const v of volunteers) {
    v.latitude = Number(v.latitude);
    v.longitude = Number(v.longitude);
    v.serviceRadiusKm = Number(v.serviceRadiusKm || 10);
  }

  // 3. Division & District Aggregations
  // Map districts to Divisions in Bangladesh
  const DIVISION_MAP = {
    dhaka: 'Dhaka', gazipur: 'Dhaka', narayanganj: 'Dhaka', tangail: 'Dhaka',
    chittagong: 'Chittagong', chattogram: 'Chittagong', coxsbazar: 'Chittagong', comilla: 'Chittagong',
    sylhet: 'Sylhet', sunamganj: 'Sylhet', moulvibazar: 'Sylhet', habiganj: 'Sylhet',
    rajshahi: 'Rajshahi', bogra: 'Rajshahi', pabna: 'Rajshahi',
    khulna: 'Khulna', jessore: 'Khulna', kushtia: 'Khulna',
    barisal: 'Barisal', bhola: 'Barisal', patuakhali: 'Barisal',
    rangpur: 'Rangpur', dinajpur: 'Rangpur',
    mymensingh: 'Mymensingh', netrokona: 'Mymensingh',
  };

  const divisionStatsMap = {
    Dhaka: { division: 'Dhaka', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Chittagong: { division: 'Chittagong', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Sylhet: { division: 'Sylhet', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Rajshahi: { division: 'Rajshahi', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Khulna: { division: 'Khulna', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Barisal: { division: 'Barisal', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Rangpur: { division: 'Rangpur', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
    Mymensingh: { division: 'Mymensingh', totalIncidents: 0, criticalCount: 0, activeDispatches: 0, volunteerCount: 0 },
  };

  incidents.forEach((inc) => {
    const rawDist = (inc.district || '').toLowerCase().replace(/[^a-z]/g, '');
    const div = DIVISION_MAP[rawDist] || 'Dhaka';
    if (divisionStatsMap[div]) {
      divisionStatsMap[div].totalIncidents += 1;
      if (inc.severity === 'CRITICAL' || inc.severity === 'HIGH') {
        divisionStatsMap[div].criticalCount += 1;
      }
      if (inc.status === 'DISPATCHING' || inc.status === 'IN_PROGRESS') {
        divisionStatsMap[div].activeDispatches += 1;
      }
    }
  });

  volunteers.forEach((vol) => {
    const rawDist = (vol.district || '').toLowerCase().replace(/[^a-z]/g, '');
    const div = DIVISION_MAP[rawDist] || 'Dhaka';
    if (divisionStatsMap[div]) {
      divisionStatsMap[div].volunteerCount += 1;
    }
  });

  const divisionStats = Object.values(divisionStatsMap).map((d) => {
    // Crisis Index score: higher means more severe crisis & responder shortage
    const crisisScore = d.criticalCount * 4 + d.totalIncidents * 2 - d.volunteerCount * 1.5;
    return {
      ...d,
      crisisIndex: Math.max(0, Math.round(crisisScore)),
      alertLevel: d.criticalCount >= 2 || d.totalIncidents >= 4 ? 'HIGH_ALERT' : d.totalIncidents > 0 ? 'MODERATE' : 'NORMAL',
    };
  }).sort((a, b) => b.crisisIndex - a.crisisIndex);

  return {
    incidents,
    volunteers,
    divisionStats,
    totalIncidents: incidents.length,
    totalVolunteers: volunteers.length,
    criticalIncidentsCount: incidents.filter((i) => i.severity === 'CRITICAL').length,
    activeDispatchesCount: incidents.filter((i) => i.status === 'DISPATCHING' || i.status === 'IN_PROGRESS').length,
  };
};

/**
 * Seed realistic nationwide demo incidents and volunteers for testing
 */
const seedNationwideCrisisData = async (adminUserId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Check existing categories
    const [categories] = await connection.query('SELECT id, name FROM incident_categories');
    if (categories.length === 0) {
      throw new Error('No incident categories found in database');
    }
    const catMap = {};
    categories.forEach((c) => {
      catMap[c.name.toLowerCase()] = c.id;
    });

    const fireCatId = catMap['fire'] || categories[0].id;
    const medicalCatId = catMap['medical emergency'] || catMap['medical'] || categories[0].id;
    const accidentCatId = catMap['road traffic accident'] || catMap['accident'] || categories[0].id;
    const floodCatId = catMap['flood'] || catMap['water crisis'] || categories[0].id;
    const collapseCatId = catMap['building collapse'] || catMap['collapse'] || categories[0].id;

    // Get a valid reporter user ID
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    const reporterId = adminUserId || users[0]?.id || 1;

    // 2. Realistic Nationwide Incident Seed Data
    const nationwideIncidents = [
      {
        title: 'Chemical Factory Fire & Toxic Fumes',
        description: 'Large chemical storage warehouse fire with toxic black smoke spreading towards residential block. Immediate evacuation required.',
        severity: 'CRITICAL',
        status: 'REPORTED',
        categoryId: fireCatId,
        latitude: 23.7509,
        longitude: 90.3842,
        addressText: 'Tejgaon Industrial Area, Dhaka',
        areaName: 'Tejgaon',
        district: 'Dhaka',
        upazila: 'Tejgaon',
      },
      {
        title: 'Highway Express Bus & Truck Collision',
        description: 'Head-on collision between passenger coach and cargo truck. Multiple passengers trapped with severe trauma injuries.',
        severity: 'CRITICAL',
        status: 'DISPATCHING',
        categoryId: accidentCatId,
        latitude: 22.3569,
        longitude: 91.7832,
        addressText: 'Agrabad Commercial Area, Chattogram',
        areaName: 'Agrabad',
        district: 'Chittagong',
        upazila: 'Double Mooring',
      },
      {
        title: 'Flash Flood River Embankment Breach',
        description: 'Surma river overflowed causing rapid flooding in low-lying villages. Over 50 families stranded on rooftops awaiting boat rescue.',
        severity: 'HIGH',
        status: 'DISPATCHING',
        categoryId: floodCatId,
        latitude: 25.0657,
        longitude: 91.4073,
        addressText: 'Sunamganj Sadar Upashahar, Sylhet',
        areaName: 'Sunamganj Sadar',
        district: 'Sylhet',
        upazila: 'Sunamganj Sadar',
      },
      {
        title: 'Old Town Multi-Story Building Structural Crack',
        description: '4-story residential building showing severe foundation subsidence and large structural cracks after continuous rain.',
        severity: 'HIGH',
        status: 'REPORTED',
        categoryId: collapseCatId,
        latitude: 23.7104,
        longitude: 90.4074,
        addressText: 'Armanitola, Old Dhaka',
        areaName: 'Armanitola',
        district: 'Dhaka',
        upazila: 'Kotwali',
      },
      {
        title: 'Electrical Substation Explosion & Power Grid Failure',
        description: 'High voltage transformer exploded near market center. Minor fire contained, 4 victims suffering burn injuries.',
        severity: 'MEDIUM',
        status: 'IN_PROGRESS',
        categoryId: fireCatId,
        latitude: 22.8456,
        longitude: 89.5403,
        addressText: 'Shibbari More, Khulna',
        areaName: 'Shibbari',
        district: 'Khulna',
        upazila: 'Khulna Sadar',
      },
      {
        title: 'University Campus Mass Food Poisoning / Emergency',
        description: 'Over 20 students showing severe acute dehydration and food poisoning symptoms. Urgent medical response needed.',
        severity: 'MEDIUM',
        status: 'DISPATCHING',
        categoryId: medicalCatId,
        latitude: 24.3745,
        longitude: 88.6042,
        addressText: 'Shaheb Bazar, Rajshahi',
        areaName: 'Shaheb Bazar',
        district: 'Rajshahi',
        upazila: 'Boalia',
      },
    ];

    let insertedIncidentsCount = 0;
    for (const inc of nationwideIncidents) {
      // Check if similar title exists
      const [existing] = await connection.query('SELECT id FROM incidents WHERE title = ? LIMIT 1', [inc.title]);
      if (existing.length === 0) {
        await connection.query(`
          INSERT INTO incidents (
            reported_by, incident_category_id, title, description, severity, status,
            latitude, longitude, address_text, area_name, district, upazila,
            reported_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
        `, [
          reporterId,
          inc.categoryId,
          inc.title,
          inc.description,
          inc.severity,
          inc.status,
          inc.latitude,
          inc.longitude,
          inc.addressText,
          inc.areaName,
          inc.district,
          inc.upazila,
        ]);
        insertedIncidentsCount += 1;
      }
    }

    // 3. Realistic Volunteer GPS Seed Placement
    const sampleVolunteers = [
      { name: 'Tanvir Ahmed (EMT Lead)', phone: '01711998877', district: 'Dhaka', upazila: 'Dhanmondi', lat: 23.7461, lng: 90.3742, radius: 10 },
      { name: 'Nusrat Jahan (First Responder)', phone: '01822334455', district: 'Chittagong', upazila: 'Agrabad', lat: 22.3384, lng: 91.8105, radius: 12 },
      { name: 'Mahmudul Hasan (Water Rescue)', phone: '01933445566', district: 'Sylhet', upazila: 'Sunamganj Sadar', lat: 25.0712, lng: 91.3989, radius: 15 },
      { name: 'Rakibul Islam (Fire Safety)', phone: '01644556677', district: 'Khulna', upazila: 'Khulna Sadar', lat: 22.8210, lng: 89.5532, radius: 8 },
      { name: 'Farhana Yeasmin (Paramedic)', phone: '01555667788', district: 'Rajshahi', upazila: 'Boalia', lat: 24.3636, lng: 88.6241, radius: 10 },
    ];

    for (const vol of sampleVolunteers) {
      // Find or create user
      let [uRows] = await connection.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [vol.phone]);
      let vUserId = uRows[0]?.id;

      if (!vUserId) {
        const [userResult] = await connection.query(`
          INSERT INTO users (phone, email, password_hash, is_active, created_at)
          VALUES (?, ?, '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6W6DpE0bZ1E0CqW.K', 1, NOW())
        `, [vol.phone, `${vol.phone}@manobprohori.org`]);
        vUserId = userResult.insertId;

        // Assign VOLUNTEER role
        const [roleRows] = await connection.query('SELECT id FROM roles WHERE name = "VOLUNTEER" LIMIT 1');
        if (roleRows[0]) {
          await connection.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [vUserId, roleRows[0].id]);
        }
      }

      // Upsert user_profiles with coordinates
      await connection.query(`
        INSERT INTO user_profiles (user_id, full_name, district, upazila, latitude, longitude, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE 
          full_name = VALUES(full_name),
          district = VALUES(district),
          upazila = VALUES(upazila),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude)
      `, [vUserId, vol.name, vol.district, vol.upazila, vol.lat, vol.lng]);

      // Upsert volunteer_profiles as APPROVED and AVAILABLE
      await connection.query(`
        INSERT INTO volunteer_profiles (user_id, verification_status, volunteer_status, preferred_service_radius_km, created_at, updated_at)
        VALUES (?, 'APPROVED', 'AVAILABLE', ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE 
          verification_status = 'APPROVED',
          volunteer_status = 'AVAILABLE',
          preferred_service_radius_km = VALUES(preferred_service_radius_km)
      `, [vUserId, vol.radius]);
    }

    await connection.commit();
    return {
      success: true,
      insertedIncidents: insertedIncidentsCount,
      seededVolunteers: sampleVolunteers.length,
      message: `Successfully initialized nationwide crisis telemetry with ${insertedIncidentsCount} new incidents and ${sampleVolunteers.length} verified responders across 5 divisions!`,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
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
  getNearbyVolunteersForIncident,
  dispatchIncidentToVolunteers,
  getIncidentDispatchedResponders,
  getNationalCrisisTelemetry,
  seedNationwideCrisisData,
};
