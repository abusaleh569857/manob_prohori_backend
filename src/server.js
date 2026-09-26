const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { testConnection } = require('./config/db');
const { initHospitalAndServicesDb } = require('./config/initHospitalAndServicesDb');
const { initBloodDb } = require('./config/initBloodDb');
const { initReliefDb } = require('./config/initReliefDb');
const { initChatSocket } = require('./sockets/chat.socket');
const auditRepository = require('./repositories/audit.repository');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test MySQL Database Connection
    const isConnected = await testConnection();

    // Initialize Database tables and seeds
    if (isConnected) {
      await initHospitalAndServicesDb();
      await initBloodDb();
      await initReliefDb();
      await auditRepository.seedInitialLogs();
    }

    // Create HTTP Server & attach Socket.IO
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Initialize chat socket rooms and event listeners
    initChatSocket(io);

    // Make io accessible globally if needed
    app.set('io', io);

    // Start Server
    server.listen(PORT, () => {
      console.log(` Server is running on port ${PORT} (http://localhost:${PORT})`);
      console.log(` WebSocket engine active with Socket.IO`);
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
