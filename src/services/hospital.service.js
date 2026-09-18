const { pool } = require('../config/db');
const hospitalRepo = require('../repositories/hospital.repository');

const getAllHospitals = async (filters) => {
  return await hospitalRepo.getAllHospitals(filters);
};

const getHospitalById = async (id) => {
  const hospital = await hospitalRepo.getHospitalById(id);
  if (!hospital) {
    const err = new Error('Hospital not found');
    err.statusCode = 404;
    throw err;
  }
  return hospital;
};

const createHospital = async (data, userId) => {
  if (!data.name || !data.phone || !data.addressText) {
    const err = new Error('Hospital name, phone number, and address are required');
    err.statusCode = 400;
    throw err;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const hospitalId = await hospitalRepo.createHospital(connection, data);
    await connection.commit();
    return await hospitalRepo.getHospitalById(hospitalId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const updateHospital = async (id, data, userId) => {
  await getHospitalById(id);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await hospitalRepo.updateHospital(connection, id, data);
    await connection.commit();
    return await hospitalRepo.getHospitalById(id);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const toggleHospitalStatus = async (id) => {
  await getHospitalById(id);
  return await hospitalRepo.toggleHospitalStatus(id);
};

const deleteHospital = async (id) => {
  await getHospitalById(id);
  return await hospitalRepo.deleteHospital(id);
};

const getAllSpecialties = async () => {
  return await hospitalRepo.getAllSpecialties();
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
