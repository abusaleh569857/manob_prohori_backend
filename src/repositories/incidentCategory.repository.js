const { pool } = require('../config/db');

const getActiveCategories = async () => {
  const [rows] = await pool.query(`
    SELECT 
      id, 
      name, 
      slug, 
      description, 
      icon_name, 
      sort_order
    FROM incident_categories
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, name ASC
  `);
  return rows;
};

const getAllCategoriesAdmin = async () => {
  const [rows] = await pool.query(`
    SELECT 
      c.id, 
      c.name, 
      c.slug, 
      c.description, 
      c.icon_name AS iconName, 
      c.sort_order AS sortOrder,
      c.is_active AS isActive,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      COUNT(i.id) AS incidentsCount
    FROM incident_categories c
    LEFT JOIN incidents i ON c.id = i.incident_category_id
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name ASC
  `);
  return rows.map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
    sortOrder: Number(r.sortOrder || 0),
    incidentsCount: Number(r.incidentsCount || 0),
  }));
};

const getCategoryById = async (id, connection = pool) => {
  const [rows] = await connection.query(`
    SELECT 
      id, 
      name, 
      slug, 
      description, 
      icon_name AS iconName, 
      sort_order AS sortOrder,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM incident_categories
    WHERE id = ?
    LIMIT 1
  `, [id]);
  if (!rows[0]) return null;
  return {
    ...rows[0],
    isActive: Boolean(rows[0].isActive),
    sortOrder: Number(rows[0].sortOrder || 0),
  };
};

const countCategoryIncidents = async (id) => {
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS count 
    FROM incidents 
    WHERE incident_category_id = ?
  `, [id]);
  return Number(rows[0]?.count || 0);
};

const createCategory = async (data) => {
  const { name, slug, description, iconName, sortOrder, isActive } = data;
  const [result] = await pool.query(`
    INSERT INTO incident_categories (name, slug, description, icon_name, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `, [
    name,
    slug,
    description || null,
    iconName || 'AlertTriangle',
    sortOrder != null ? Number(sortOrder) : 0,
    isActive !== false ? 1 : 0,
  ]);
  return result.insertId;
};

const updateCategory = async (id, data) => {
  const { name, slug, description, iconName, sortOrder, isActive } = data;
  await pool.query(`
    UPDATE incident_categories
    SET 
      name = ?,
      slug = ?,
      description = ?,
      icon_name = ?,
      sort_order = ?,
      is_active = ?,
      updated_at = NOW()
    WHERE id = ?
  `, [
    name,
    slug,
    description || null,
    iconName || 'AlertTriangle',
    sortOrder != null ? Number(sortOrder) : 0,
    isActive !== false ? 1 : 0,
    id,
  ]);
  return true;
};

const toggleCategoryStatus = async (id) => {
  await pool.query(`
    UPDATE incident_categories
    SET is_active = NOT is_active, updated_at = NOW()
    WHERE id = ?
  `, [id]);
  return true;
};

const deleteCategory = async (id) => {
  await pool.query(`
    DELETE FROM incident_categories
    WHERE id = ?
  `, [id]);
  return true;
};

module.exports = {
  getActiveCategories,
  getAllCategoriesAdmin,
  getCategoryById,
  countCategoryIncidents,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
};
