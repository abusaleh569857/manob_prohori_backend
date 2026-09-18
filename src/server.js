const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const { testConnection } = require('./config/db');
const { initHospitalAndServicesDb } = require('./config/initHospitalAndServicesDb');
const { initBloodDb } = require('./config/initBloodDb');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test MySQL Database Connection
    const isConnected = await testConnection();

    // Initialize Database tables and seeds
    if (isConnected) {
      await initHospitalAndServicesDb();
      await initBloodDb();
    }

    // Start Express Server
    const server = app.listen(PORT, () => {
      console.log(` Server is running on port ${PORT} (http://localhost:${PORT})`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown handling
    const shutdown = () => {
      console.log('\n Shutting down server gracefully...');
      server.close(() => {
        console.log(' Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
