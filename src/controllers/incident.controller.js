const incidentService = require('../services/incident.service');

const createIncident = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await incidentService.createIncident(userId, req.body);

    res.status(201).json({
      success: true,
      message: 'Incident reported successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAllIncidents = async (req, res, next) => {
  try {
    const { status, severity, search, page, limit } = req.query;
    const incidents = await incidentService.getAllIncidents({
      status,
      severity,
      search,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      data: incidents,
    });
  } catch (error) {
    next(error);
  }
};

const getAdminOverviewStats = async (req, res, next) => {
  try {
    const stats = await incidentService.getAdminOverviewStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

const getMyIncidents = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const incidents = await incidentService.getMyIncidents(userId);

    res.status(200).json({
      success: true,
      data: incidents,
    });
  } catch (error) {
    next(error);
  }
};

const getIncidentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const incident = await incidentService.getIncidentDetails(id, req.user);

    res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
};

const getIncidentHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const history = await incidentService.getIncidentHistory(id, req.user);

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

const updateIncidentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const result = await incidentService.updateIncidentStatus(id, req.user, status, note);

    res.status(200).json({
      success: true,
      message: `Incident status updated to ${status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createIncident,
  getAllIncidents,
  getAdminOverviewStats,
  getMyIncidents,
  getIncidentById,
  getIncidentHistory,
  updateIncidentStatus,
};
