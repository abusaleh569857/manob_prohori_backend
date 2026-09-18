const emergencyService = require('../services/emergencyService.service');

const getAllEmergencyServices = async (req, res, next) => {
  try {
    const { type, search, region } = req.query;
    const isAdmin = req.user?.roles?.includes('ADMIN');

    const services = await emergencyService.getAllEmergencyServices({
      type,
      search,
      region,
      isAdmin,
    });

    res.status(200).json({
      success: true,
      data: services,
    });
  } catch (error) {
    next(error);
  }
};

const getServiceContacts = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const contacts = await emergencyService.getServiceContacts(serviceId);

    res.status(200).json({
      success: true,
      data: contacts,
    });
  } catch (error) {
    next(error);
  }
};

const createServiceContact = async (req, res, next) => {
  try {
    const contact = await emergencyService.createServiceContact(req.body);

    res.status(201).json({
      success: true,
      message: 'Emergency contact added successfully',
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

const updateServiceContact = async (req, res, next) => {
  try {
    const { id } = req.params;
    await emergencyService.updateServiceContact(id, req.body);

    res.status(200).json({
      success: true,
      message: 'Emergency contact updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

const deleteServiceContact = async (req, res, next) => {
  try {
    const { id } = req.params;
    await emergencyService.deleteServiceContact(id);

    res.status(200).json({
      success: true,
      message: 'Emergency contact deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllEmergencyServices,
  getServiceContacts,
  createServiceContact,
  updateServiceContact,
  deleteServiceContact,
};
