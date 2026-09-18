const hospitalService = require('../services/hospital.service');

const getAllHospitals = async (req, res, next) => {
  try {
    const {
      search,
      division,
      district,
      emergencyOnly,
      specialtyId,
      latitude,
      longitude,
      limit,
      offset,
    } = req.query;

    const isAdmin = req.user?.roles?.includes('ADMIN');

    const hospitals = await hospitalService.getAllHospitals({
      search,
      division,
      district,
      emergencyOnly,
      specialtyId,
      latitude,
      longitude,
      limit,
      offset,
      isAdmin,
    });

    res.status(200).json({
      success: true,
      data: hospitals,
    });
  } catch (error) {
    next(error);
  }
};

const getHospitalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hospital = await hospitalService.getHospitalById(id);

    res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    next(error);
  }
};

const createHospital = async (req, res, next) => {
  try {
    const hospital = await hospitalService.createHospital(req.body, req.user?.id);

    res.status(201).json({
      success: true,
      message: 'Hospital added successfully',
      data: hospital,
    });
  } catch (error) {
    next(error);
  }
};

const updateHospital = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hospital = await hospitalService.updateHospital(id, req.body, req.user?.id);

    res.status(200).json({
      success: true,
      message: 'Hospital updated successfully',
      data: hospital,
    });
  } catch (error) {
    next(error);
  }
};

const toggleHospitalStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await hospitalService.toggleHospitalStatus(id);

    res.status(200).json({
      success: true,
      message: `Hospital status updated`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteHospital = async (req, res, next) => {
  try {
    const { id } = req.params;
    await hospitalService.deleteHospital(id);

    res.status(200).json({
      success: true,
      message: 'Hospital deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

const getAllSpecialties = async (req, res, next) => {
  try {
    const specialties = await hospitalService.getAllSpecialties();

    res.status(200).json({
      success: true,
      data: specialties,
    });
  } catch (error) {
    next(error);
  }
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
