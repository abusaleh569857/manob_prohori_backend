const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const incidentCategoryRoutes = require('./routes/incidentCategory.routes');
const incidentRoutes = require('./routes/incident.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
