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

const getCategoryById = async (id, connection = pool) => {
  const [rows] = await connection.query(`
    SELECT 
      id, 
      name, 
      slug, 
      description, 
      icon_name, 
      is_active
    FROM incident_categories
    WHERE id = ?
    LIMIT 1
  `, [id]);
  return rows[0] || null;
};

module.exports = {
  getActiveCategories,
  getCategoryById,
};
