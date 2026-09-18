const emergencyServiceRepo = require('../repositories/emergencyService.repository');

const getAllEmergencyServices = async (filters) => {
  return await emergencyServiceRepo.getAllEmergencyServices(filters);
};

const getServiceContacts = async (serviceId) => {
  return await emergencyServiceRepo.getServiceContacts(serviceId);
};

const createServiceContact = async (data) => {
  if (!data.emergencyServiceId || !data.phoneNumber) {
    const err = new Error('Service ID and phone number are required');
    err.statusCode = 400;
    throw err;
  }
  return await emergencyServiceRepo.createServiceContact(data);
};

const updateServiceContact = async (id, data) => {
  return await emergencyServiceRepo.updateServiceContact(id, data);
};

const deleteServiceContact = async (id) => {
  return await emergencyServiceRepo.deleteServiceContact(id);
};

module.exports = {
  getAllEmergencyServices,
  getServiceContacts,
  createServiceContact,
  updateServiceContact,
  deleteServiceContact,
};
