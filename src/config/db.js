const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'manob_prohori',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true
});

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ MySQL Database connected successfully! (Database: ${process.env.DB_NAME || 'manob_prohori'})`);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('👉 Please ensure MySQL service is running and credentials in .env are correct.');
    return false;
  }
};

module.exports = {
  pool,
  testConnection
};
