const { pool } = require('../config/db');
const volunteerRepo = require('../repositories/volunteer.repository');

const getVolunteerProfile = async (userId) => {
  return await volunteerRepo.getVolunteerProfile(userId);
};

const updateVolunteerStatus = async (userId, status) => {
  return await volunteerRepo.updateVolunteerStatus(userId, status);
};

const updateVolunteerLocation = async (userId, latitude, longitude) => {
  return await volunteerRepo.updateVolunteerLocation(userId, latitude, longitude);
};

const getNearbyDispatches = async (userId) => {
  return await volunteerRepo.getNearbyDispatches(userId);
};

const getActiveMission = async (userId) => {
  return await volunteerRepo.getActiveMission(userId);
};

const acceptIncidentResponse = async (incidentId, userId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const result = await volunteerRepo.acceptIncidentResponse(
      connection,
      incidentId,
      userId
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

const declineIncidentResponse = async (incidentId, userId, reason) => {
  return await volunteerRepo.declineIncidentResponse(incidentId, userId, reason);
};

const updateMissionStatus = async (incidentId, userId, newStatus, note) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const result = await volunteerRepo.updateMissionStatus(
      connection,
      incidentId,
      userId,
      newStatus,
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

const getMissionHistory = async (userId) => {
  return await volunteerRepo.getMissionHistory(userId);
};

const getAllAvailableSkills = async () => {
  return await volunteerRepo.getAllAvailableSkills();
};

const getVolunteerVerificationApplication = async (userId) => {
  return await volunteerRepo.getVolunteerVerificationApplication(userId);
};

const submitVolunteerVerificationApplication = async (userId, data) => {
  return await volunteerRepo.submitVolunteerVerificationApplication(userId, data);
};

const getAdminVolunteersList = async (filters) => {
  return await volunteerRepo.getAdminVolunteersList(filters);
};

const verifyVolunteerByAdmin = async (adminUserId, volunteerUserId, status, rejectionReason) => {
  return await volunteerRepo.verifyVolunteerByAdmin(adminUserId, volunteerUserId, status, rejectionReason);
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
