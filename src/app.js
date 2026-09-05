const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const incidentCategoryRoutes = require('./routes/incidentCategory.routes');
const incidentRoutes = require('./routes/incident.routes');
const volunteerRoutes = require('./routes/volunteer.routes');
const uploadRoutes = require('./routes/upload.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Security and utility middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static directory for uploaded incident photos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root and Health routes
app.get('/', (req, res) => {
  res.json({
    name: 'Manob Prohori API',
    version: '1.0.0',
    status: 'active',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Mount feature routes
app.use('/api/auth', authRoutes);
app.use('/api/incident-categories', incidentCategoryRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/uploads', uploadRoutes);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
