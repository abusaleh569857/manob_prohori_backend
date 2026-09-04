const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const generateToken = (payload) => {
  const secret = process.env.JWT_SECRET || 'manob_prohori_default_secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
};

const register = async (userData) => {
  const {
    email,
    phone,
    password,
    fullName,
    accountType = 'USER',
    bloodGroup,
    bloodGroupId,
    dateOfBirth,
    gender,
    addressLine,
    district,
    upazila,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelation
  } = userData;

  if (!phone || !password || !fullName) {
    const error = new Error('Phone, password, and full name are required');
    error.statusCode = 400;
    throw error;
  }

  // Check if user with given phone or email already exists
  const [existing] = await pool.query(
    'SELECT id, phone, email FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)',
    [phone, email || null]
  );

  if (existing.length > 0) {
    const duplicate = existing[0].phone === phone ? 'Phone number' : 'Email';
    const error = new Error(`${duplicate} is already registered`);
    error.statusCode = 409;
    throw error;
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Resolve blood_group_id if bloodGroup string is provided
    let resolvedBloodGroupId = bloodGroupId || null;
    if (!resolvedBloodGroupId && bloodGroup) {
      const [bgRows] = await connection.query(
        'SELECT id FROM blood_groups WHERE code = ? LIMIT 1',
        [bloodGroup]
      );
      if (bgRows.length > 0) {
        resolvedBloodGroupId = bgRows[0].id;
      }
    }

    // Default to blood group id 1 (A+) if donor didn't specify one
    if (accountType === 'BLOOD_DONOR' && !resolvedBloodGroupId) {
      resolvedBloodGroupId = 7; // O+ default
    }

    // 2. Insert into users table
    const [userResult] = await connection.query(
      'INSERT INTO users (email, phone, password_hash) VALUES (?, ?, ?)',
      [email || null, phone, passwordHash]
    );
    const userId = userResult.insertId;

    // 3. Insert into user_profiles
    await connection.query(
      `INSERT INTO user_profiles 
       (user_id, full_name, date_of_birth, gender, blood_group_id, address_line, district, upazila, emergency_contact_name, emergency_contact_phone, emergency_contact_relation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        fullName,
        dateOfBirth || null,
        gender || null,
        resolvedBloodGroupId,
        addressLine || null,
        district || null,
        upazila || null,
        emergencyContactName || null,
        emergencyContactPhone || null,
        emergencyContactRelation || null
      ]
    );

    // 4. Assign Roles based on accountType
    const rolesToAssign = ['USER'];
    if (accountType === 'VOLUNTEER') {
      rolesToAssign.push('VOLUNTEER');
    } else if (accountType === 'BLOOD_DONOR') {
      rolesToAssign.push('BLOOD_DONOR');
    }

    for (const roleCode of rolesToAssign) {
      const [roleRows] = await connection.query('SELECT id FROM roles WHERE code = ? LIMIT 1', [roleCode]);
      if (roleRows.length > 0) {
        await connection.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [userId, roleRows[0].id]
        );
      }
    }

    // 5. If Volunteer, create volunteer_profiles with verification_status = 'PENDING'
    if (accountType === 'VOLUNTEER') {
      await connection.query(
        `INSERT INTO volunteer_profiles (user_id, volunteer_status, verification_status, preferred_service_radius_km)
         VALUES (?, 'UNAVAILABLE', 'PENDING', 10.00)`,
        [userId]
      );
    }

    // 6. If Blood Donor, create blood_donor_profiles with verification_status = 'PENDING'
    if (accountType === 'BLOOD_DONOR') {
      await connection.query(
        `INSERT INTO blood_donor_profiles (user_id, blood_group_id, availability, verification_status)
         VALUES (?, ?, 'AVAILABLE', 'PENDING')`,
        [userId, resolvedBloodGroupId]
      );
    }

    await connection.commit();

    // Generate JWT token
    const token = generateToken({
      id: userId,
      phone,
      email: email || null,
      roles: rolesToAssign
    });

    return {
      token,
      user: {
        id: userId,
        phone,
        email: email || null,
        fullName,
        accountType,
        roles: rolesToAssign,
        requiresVerification: accountType !== 'USER'
      }
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const login = async ({ identifier, password, ipAddress }) => {
  if (!identifier || !password) {
    const error = new Error('Identifier (email/phone) and password are required');
    error.statusCode = 400;
    throw error;
  }

  // Find user by phone or email
  const [users] = await pool.query(
    `SELECT u.id, u.email, u.phone, u.password_hash, u.is_active, 
            p.full_name, p.profile_photo_url, p.district
     FROM users u
     LEFT JOIN user_profiles p ON u.id = p.user_id
     WHERE u.phone = ? OR u.email = ?
     LIMIT 1`,
    [identifier, identifier]
  );

  if (users.length === 0) {
    const error = new Error('Invalid phone/email or password');
    error.statusCode = 401;
    throw error;
  }

  const user = users[0];

  if (!user.is_active) {
    const error = new Error('Account is deactivated. Please contact support.');
    error.statusCode = 403;
    throw error;
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordMatch) {
    const error = new Error('Invalid phone/email or password');
    error.statusCode = 401;
    throw error;
  }

  // Fetch roles
  const [rolesResult] = await pool.query(
    `SELECT r.code, r.name 
     FROM user_roles ur 
     JOIN roles r ON ur.role_id = r.id 
     WHERE ur.user_id = ?`,
    [user.id]
  );

  const roles = rolesResult.map((r) => r.code);

  // Update last login details
  await pool.query(
    'UPDATE users SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?',
    [ipAddress || null, user.id]
  );

  const token = generateToken({
    id: user.id,
    phone: user.phone,
    email: user.email,
    roles
  });

  return {
    token,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.full_name,
      profilePhotoUrl: user.profile_photo_url,
      district: user.district,
      roles
    }
  };
};

const getProfile = async (userId) => {
  const [users] = await pool.query(
    `SELECT u.id, u.email, u.phone, u.is_phone_verified, u.is_email_verified, u.created_at,
            p.full_name, p.date_of_birth, p.gender, p.blood_group_id, bg.code AS blood_group,
            p.profile_photo_url, p.address_line, p.city, p.district, p.upazila, p.postal_code,
            p.latitude, p.longitude, p.emergency_contact_name, p.emergency_contact_phone, p.emergency_contact_relation
     FROM users u
     LEFT JOIN user_profiles p ON u.id = p.user_id
     LEFT JOIN blood_groups bg ON p.blood_group_id = bg.id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );

  if (users.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const [rolesResult] = await pool.query(
    `SELECT r.code, r.name, r.description 
     FROM user_roles ur 
     JOIN roles r ON ur.role_id = r.id 
     WHERE ur.user_id = ?`,
    [userId]
  );

  return {
    ...users[0],
    roles: rolesResult.map((r) => r.code),
    rolesDetail: rolesResult
  };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    const error = new Error('Both current and new password are required');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error('New password must be at least 6 characters long');
    error.statusCode = 400;
    throw error;
  }

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!isMatch) {
    const error = new Error('Current password does not match');
    error.statusCode = 400;
    throw error;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

  return { message: 'Password updated successfully' };
};

module.exports = {
  register,
  login,
  getProfile,
  changePassword
};
