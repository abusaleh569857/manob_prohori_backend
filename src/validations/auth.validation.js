const { z } = require('zod');

const phoneRegex = /^(?:\+?880|0)?1[3-9]\d{8}$/;

const registerSchema = z.object({
  fullName: z.string({
    required_error: 'Full name is required'
  }).min(2, 'Full name must be at least 2 characters').max(150, 'Full name cannot exceed 150 characters'),
  
  phone: z.string({
    required_error: 'Phone number is required'
  }).regex(phoneRegex, 'Please enter a valid Bangladeshi phone number (e.g., 01712345678)'),
  
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  
  password: z.string({
    required_error: 'Password is required'
  }).min(6, 'Password must be at least 6 characters long').max(100, 'Password is too long'),
  
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  bloodGroupId: z.number().int().positive().optional(),
  addressLine: z.string().max(255).optional(),
  district: z.string().max(120).optional(),
  upazila: z.string().max(120).optional(),
  emergencyContactName: z.string().max(150).optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().max(80).optional()
});

const loginSchema = z.object({
  identifier: z.string({
    required_error: 'Phone number or email is required'
  }).min(1, 'Phone number or email cannot be empty'),
  
  password: z.string({
    required_error: 'Password is required'
  }).min(1, 'Password cannot be empty')
});

const changePasswordSchema = z.object({
  currentPassword: z.string({
    required_error: 'Current password is required'
  }).min(1, 'Current password cannot be empty'),
  
  newPassword: z.string({
    required_error: 'New password is required'
  }).min(6, 'New password must be at least 6 characters long')
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema
};
