const { pool } = require('../config/db');
const incidentCategoryRepo = require('../repositories/incidentCategory.repository');
const incidentRepo = require('../repositories/incident.repository');

const createIncident = async (userId, incidentData) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Validate that Category exists and is active
    const category = await incidentCategoryRepo.getCategoryById(
      incidentData.incidentCategoryId,
      connection
    );

    if (!category || !category.is_active) {
      const error = new Error('Invalid or inactive incident category');
      error.statusCode = 400;
      throw error;
    }

    // 2. Insert incident inside transaction
    const incidentId = await incidentRepo.createIncident(connection, {
      ...incidentData,
      reportedBy: userId,
    });

    // 3. Create initial status history entry (REPORTED)
    await incidentRepo.createStatusHistory(connection, {
      incidentId,
      oldStatus: null,
      newStatus: 'REPORTED',
      changedBy: userId,
      note: 'Incident reported by user',
    });

    await connection.commit();

    return {
      id: incidentId,
      status: 'REPORTED',
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getAllIncidents = async (filters) => {
  return await incidentRepo.getAllIncidents(filters);
};

const getAdminOverviewStats = async () => {
  return await incidentRepo.getAdminOverviewStats();
};

const getMyIncidents = async (userId) => {
  return await incidentRepo.getMyIncidents(userId);
};

const getIncidentDetails = async (incidentId, user) => {
  const incident = await incidentRepo.getIncidentById(incidentId);

  if (!incident) {
    const error = new Error('Incident not found');
    error.statusCode = 404;
    throw error;
  }

  return incident;
};

const getIncidentHistory = async (incidentId, user) => {
  const incident = await incidentRepo.getIncidentById(incidentId);

  if (!incident) {
    const error = new Error('Incident not found');
    error.statusCode = 404;
    throw error;
  }

  return await incidentRepo.getIncidentHistory(incidentId);
};

const updateIncidentStatus = async (incidentId, user, newStatus, note) => {
  const incident = await incidentRepo.getIncidentById(incidentId);

  if (!incident) {
    const error = new Error('Incident not found');
    error.statusCode = 404;
    throw error;
  }

  const userRoles = user.roles || [];
  const isAdmin = userRoles.includes('ADMIN');
  const isVolunteer = userRoles.includes('VOLUNTEER');
  const isReporter = String(incident.reportedBy) === String(user.id);

  // Authorization check based on status transition
  if (newStatus === 'CANCELLED') {
    if (!isReporter && !isAdmin) {
      const error = new Error('Only the reporter or an admin can cancel this incident');
      error.statusCode = 403;
      throw error;
    }
  } else if (['VERIFIED', 'REJECTED', 'DISPATCHING'].includes(newStatus)) {
    if (!isAdmin) {
      const error = new Error('Only administrators can moderate and dispatch incidents');
      error.statusCode = 403;
      throw error;
    }
  } else if (['RESPONDER_ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(newStatus)) {
    if (!isAdmin && !isVolunteer) {
      const error = new Error('Only volunteers or administrators can update responder status');
      error.statusCode = 403;
      throw error;
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const result = await incidentRepo.updateIncidentStatus(
      connection,
      incidentId,
      newStatus,
      user.id,
      note
    );

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getNearbyVolunteersForIncident = async (incidentId, radiusKm) => {
  return await incidentRepo.getNearbyVolunteersForIncident(incidentId, radiusKm);
};

const dispatchIncidentToVolunteers = async (incidentId, volunteerUserIds, adminUserId, note) => {
  if (!volunteerUserIds || !Array.isArray(volunteerUserIds) || volunteerUserIds.length === 0) {
    const error = new Error('Please select at least one volunteer to dispatch.');
    error.statusCode = 400;
    throw error;
  }
  return await incidentRepo.dispatchIncidentToVolunteers(incidentId, volunteerUserIds, adminUserId, note);
};

const getIncidentDispatchedResponders = async (incidentId) => {
  return await incidentRepo.getIncidentDispatchedResponders(incidentId);
};

const getNationalCrisisTelemetry = async () => {
  return await incidentRepo.getNationalCrisisTelemetry();
};

const seedNationwideCrisisData = async (adminUserId) => {
  return await incidentRepo.seedNationwideCrisisData(adminUserId);
};

module.exports = {
  createIncident,
  getAllIncidents,
  getAdminOverviewStats,
  getMyIncidents,
  getIncidentDetails,
  getIncidentHistory,
  updateIncidentStatus,
  getNearbyVolunteersForIncident,
  dispatchIncidentToVolunteers,
  getIncidentDispatchedResponders,
  getNationalCrisisTelemetry,
  seedNationwideCrisisData,
};
