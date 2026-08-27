const incidentCategoryRepo = require('../repositories/incidentCategory.repository');

const getAllActiveCategories = async () => {
  const categories = await incidentCategoryRepo.getActiveCategories();
  return categories;
};

module.exports = {
  getAllActiveCategories,
};
