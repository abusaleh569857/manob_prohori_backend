const incidentCategoryRepo = require('../repositories/incidentCategory.repository');

/**
 * Helper to generate slug from name
 */
const generateSlug = (text) => {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
};

const getAllActiveCategories = async () => {
  const categories = await incidentCategoryRepo.getActiveCategories();
  return categories;
};

const getAllCategoriesAdmin = async () => {
  const categories = await incidentCategoryRepo.getAllCategoriesAdmin();
  return categories;
};

const createCategory = async (payload) => {
  if (!payload.name || !payload.name.trim()) {
    const err = new Error('Category name is required');
    err.statusCode = 400;
    throw err;
  }

  const slug = payload.slug && payload.slug.trim() ? generateSlug(payload.slug) : generateSlug(payload.name);

  const categoryId = await incidentCategoryRepo.createCategory({
    name: payload.name.trim(),
    slug,
    description: payload.description ? payload.description.trim() : null,
    iconName: payload.iconName || 'AlertTriangle',
    sortOrder: payload.sortOrder != null ? Number(payload.sortOrder) : 0,
    isActive: payload.isActive !== false,
  });

  return await incidentCategoryRepo.getCategoryById(categoryId);
};

const updateCategory = async (id, payload) => {
  const existing = await incidentCategoryRepo.getCategoryById(id);
  if (!existing) {
    const err = new Error('Category not found');
    err.statusCode = 404;
    throw err;
  }

  if (!payload.name || !payload.name.trim()) {
    const err = new Error('Category name is required');
    err.statusCode = 400;
    throw err;
  }

  const slug = payload.slug && payload.slug.trim() ? generateSlug(payload.slug) : generateSlug(payload.name);

  await incidentCategoryRepo.updateCategory(id, {
    name: payload.name.trim(),
    slug,
    description: payload.description ? payload.description.trim() : null,
    iconName: payload.iconName || existing.iconName || 'AlertTriangle',
    sortOrder: payload.sortOrder != null ? Number(payload.sortOrder) : (existing.sortOrder || 0),
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : existing.isActive,
  });

  return await incidentCategoryRepo.getCategoryById(id);
};

const toggleCategoryStatus = async (id) => {
  const existing = await incidentCategoryRepo.getCategoryById(id);
  if (!existing) {
    const err = new Error('Category not found');
    err.statusCode = 404;
    throw err;
  }

  await incidentCategoryRepo.toggleCategoryStatus(id);
  return await incidentCategoryRepo.getCategoryById(id);
};

const deleteCategory = async (id) => {
  const existing = await incidentCategoryRepo.getCategoryById(id);
  if (!existing) {
    const err = new Error('Category not found');
    err.statusCode = 404;
    throw err;
  }

  // Safe deletion check: Check if any incidents reference this category
  const linkedIncidentsCount = await incidentCategoryRepo.countCategoryIncidents(id);
  if (linkedIncidentsCount > 0) {
    const err = new Error(`Cannot delete category "${existing.name}" because it is referenced by ${linkedIncidentsCount} incident(s). You can deactivate it instead.`);
    err.statusCode = 400;
    throw err;
  }

  await incidentCategoryRepo.deleteCategory(id);
  return { success: true, message: `Category "${existing.name}" permanently deleted.` };
};

module.exports = {
  getAllActiveCategories,
  getAllCategoriesAdmin,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
};
