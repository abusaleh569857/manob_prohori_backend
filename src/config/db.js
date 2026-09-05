const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let sslConfig = undefined;
if (process.env.DB_SSL === 'true') {
  const certPath = process.env.DB_CA_CERT_PATH
    ? path.resolve(__dirname, '../../', process.env.DB_CA_CERT_PATH)
    : path.resolve(__dirname, '../certs/ca.pem');

  if (fs.existsSync(certPath)) {
    sslConfig = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(certPath, 'utf-8')
    };
  } else {
    sslConfig = {
      rejectUnauthorized: false
    };
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'manob_prohori',
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true
});

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ MySQL Database connected successfully! (Database: ${process.env.DB_NAME || 'manob_prohori'}, Host: ${process.env.DB_HOST})`);
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
