const volunteerService = require('../services/volunteer.service');

const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const profile = await volunteerService.getVolunteerProfile(userId);

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status } = req.body;

    if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be AVAILABLE or UNAVAILABLE',
      });
    }

    const result = await volunteerService.updateVolunteerStatus(userId, status);

    res.status(200).json({
      success: true,
      message: `Duty status updated to ${status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateLocation = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const result = await volunteerService.updateVolunteerLocation(userId, latitude, longitude);

    res.status(200).json({
      success: true,
      message: 'Location updated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getNearbyDispatches = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const dispatches = await volunteerService.getNearbyDispatches(userId);

    res.status(200).json({
      success: true,
      data: dispatches,
    });
  } catch (error) {
    next(error);
  }
};

const getActiveMission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const mission = await volunteerService.getActiveMission(userId);

    res.status(200).json({
      success: true,
      data: mission,
    });
  } catch (error) {
    next(error);
  }
};

const acceptDispatch = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { incidentId } = req.params;

    const result = await volunteerService.acceptIncidentResponse(incidentId, userId);

    res.status(200).json({
      success: true,
      message: 'Emergency response accepted! You are assigned to this incident.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const declineDispatch = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { incidentId } = req.params;
    const { reason } = req.body;

    const result = await volunteerService.declineIncidentResponse(incidentId, userId, reason);

    res.status(200).json({
      success: true,
      message: 'Dispatch declined',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateMissionStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { incidentId } = req.params;
    const { status, note } = req.body;

    if (!['EN_ROUTE', 'ON_SCENE', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mission status',
      });
    }

    const result = await volunteerService.updateMissionStatus(
      incidentId,
      userId,
      status,
      note
    );

    res.status(200).json({
      success: true,
      message: `Mission progress updated to ${status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getMissionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const history = await volunteerService.getMissionHistory(userId);

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

const getSkills = async (req, res, next) => {
  try {
    const skills = await volunteerService.getAllAvailableSkills();
    res.status(200).json({
      success: true,
      data: skills,
    });
  } catch (error) {
    next(error);
  }
};

const getVerificationApplication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const application = await volunteerService.getVolunteerVerificationApplication(userId);
    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

const submitVerificationApplication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await volunteerService.submitVolunteerVerificationApplication(userId, req.body);
    res.status(200).json({
      success: true,
      message: 'Verification application submitted successfully for Admin review',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAdminVolunteersList = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
    };
    const volunteers = await volunteerService.getAdminVolunteersList(filters);
    res.status(200).json({
      success: true,
      data: volunteers,
    });
  } catch (error) {
    next(error);
  }
};

const verifyVolunteer = async (req, res, next) => {
  try {
    const adminUserId = req.user.id;
    const { userId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status',
      });
    }

    const result = await volunteerService.verifyVolunteerByAdmin(
      adminUserId,
      userId,
      status,
      rejectionReason
    );

    res.status(200).json({
      success: true,
      message: `Volunteer application marked as ${status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyProfile,
  updateStatus,
  updateLocation,
  getNearbyDispatches,
  getActiveMission,
  acceptDispatch,
  declineDispatch,
  updateMissionStatus,
  getMissionHistory,
  getSkills,
  getVerificationApplication,
  submitVerificationApplication,
  getAdminVolunteersList,
  verifyVolunteer,
};
