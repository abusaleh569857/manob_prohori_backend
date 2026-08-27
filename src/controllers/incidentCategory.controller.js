const incidentCategoryService = require('../services/incidentCategory.service');

const getCategories = async (req, res, next) => {
  try {
    const categories = await incidentCategoryService.getAllActiveCategories();
    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategories,
};
