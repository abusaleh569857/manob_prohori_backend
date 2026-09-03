const { z } = require('zod');

const createIncidentSchema = z.object({
  incidentCategoryId: z.coerce.number({
    required_error: 'Incident category is required',
    invalid_type_error: 'Incident category must be a number',
  }).int().positive('Please select a valid incident category'),

  title: z.string({
    required_error: 'Title is required',
  })
    .trim()
    .min(5, 'Title must be at least 5 characters long')
    .max(200, 'Title cannot exceed 200 characters'),

  description: z.string({
    required_error: 'Description is required',
  })
    .trim()
    .min(10, 'Please provide a detailed description (minimum 10 characters)'),

  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], {
    errorMap: () => ({ message: 'Severity must be LOW, MEDIUM, HIGH, or CRITICAL' }),
  }).default('MEDIUM'),

  latitude: z.coerce.number({
    required_error: 'Latitude is required',
    invalid_type_error: 'Latitude must be a valid coordinate number',
  }).min(-90).max(90, 'Latitude must be between -90 and 90'),

  longitude: z.coerce.number({
    required_error: 'Longitude is required',
    invalid_type_error: 'Longitude must be a valid coordinate number',
  }).min(-180).max(180, 'Longitude must be between -180 and 180'),

  locationAccuracyMeters: z.coerce.number().optional().nullable(),
  addressText: z.string().max(500).optional().nullable(),
  areaName: z.string().max(150).optional().nullable(),
  district: z.string().max(120).optional().nullable(),
  upazila: z.string().max(120).optional().nullable(),
  incidentStartedAt: z.string().datetime().optional().nullable().or(z.literal('')),
  imageUrls: z.array(z.string()).optional().default([]),
});

const updateIncidentStatusSchema = z.object({
  status: z.enum([
    'REPORTED',
    'VERIFIED',
    'DISPATCHING',
    'RESPONDER_ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
    'CANCELLED',
    'REJECTED',
  ], {
    errorMap: () => ({ message: 'Invalid incident status' }),
  }),
  note: z.string().max(500).optional(),
});

module.exports = {
  createIncidentSchema,
  updateIncidentStatusSchema,
};
