const { pool } = require('./db');

/**
 * Initialize Blood Registry, Donor Verification, and Request/Matching tables and seeds
 */
const initBloodDb = async () => {
  try {
    // 1. Create Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_groups (
        id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(5) NOT NULL UNIQUE,
        name VARCHAR(50) NOT NULL
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donor_profiles (
        user_id BIGINT UNSIGNED PRIMARY KEY,
        blood_group_id SMALLINT UNSIGNED NOT NULL,
        availability ENUM('AVAILABLE','UNAVAILABLE') NOT NULL DEFAULT 'UNAVAILABLE',
        last_donation_date DATE NULL,
        latitude DECIMAL(10,7) NULL,
        longitude DECIMAL(10,7) NULL,
        location_updated_at DATETIME NULL,
        verification_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        verified_at DATETIME NULL,
        verified_by BIGINT UNSIGNED NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (blood_group_id) REFERENCES blood_groups(id) ON DELETE RESTRICT,
        FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_donor_match (blood_group_id, availability, verification_status),
        INDEX idx_donor_geo (latitude, longitude)
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donor_verifications (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        donor_user_id BIGINT UNSIGNED NOT NULL,
        verification_type ENUM('BLOOD_REPORT','DONATION_REPORT','HOSPITAL_DOCUMENT') NOT NULL DEFAULT 'BLOOD_REPORT',
        status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        hospital_name VARCHAR(255) NULL,
        report_date DATE NULL,
        blood_group_id SMALLINT UNSIGNED NULL,
        document_url VARCHAR(500) NOT NULL,
        notes VARCHAR(1000) NULL,
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME NULL,
        reviewed_by BIGINT UNSIGNED NULL,
        FOREIGN KEY (donor_user_id) REFERENCES blood_donor_profiles(user_id) ON DELETE CASCADE,
        FOREIGN KEY (blood_group_id) REFERENCES blood_groups(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_donor_verify (donor_user_id, status)
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donor_documents (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        donor_user_id BIGINT UNSIGNED NOT NULL,
        document_type ENUM('BLOOD_REPORT','DONATION_REPORT','OTHER') NOT NULL DEFAULT 'BLOOD_REPORT',
        file_url VARCHAR(500) NOT NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (donor_user_id) REFERENCES blood_donor_profiles(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_requests (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        requested_by BIGINT UNSIGNED NOT NULL,
        incident_id BIGINT UNSIGNED NULL,
        blood_group_id SMALLINT UNSIGNED NOT NULL,
        required_units DECIMAL(6,2) NULL DEFAULT 1.0,
        hospital_id BIGINT UNSIGNED NULL,
        hospital_name VARCHAR(255) NULL,
        contact_phone VARCHAR(50) NULL,
        needed_by DATETIME NULL,
        description VARCHAR(1000) NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        address_text VARCHAR(500) NULL,
        status ENUM('OPEN','FULFILLED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'OPEN',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
        FOREIGN KEY (blood_group_id) REFERENCES blood_groups(id) ON DELETE RESTRICT,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL,
        INDEX idx_blood_request_match (blood_group_id, status),
        INDEX idx_blood_request_geo (latitude, longitude)
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_request_matches (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        blood_request_id BIGINT UNSIGNED NOT NULL,
        donor_user_id BIGINT UNSIGNED NOT NULL,
        distance_km DECIMAL(8,3) NULL,
        notification_stage ENUM('MATCHED','AREA_BROADCAST','EXPANDED_RADIUS') NOT NULL DEFAULT 'MATCHED',
        status ENUM('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'PENDING',
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        responded_at DATETIME NULL,
        completed_at DATETIME NULL,
        FOREIGN KEY (blood_request_id) REFERENCES blood_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (donor_user_id) REFERENCES blood_donor_profiles(user_id) ON DELETE CASCADE,
        UNIQUE KEY uq_blood_request_donor_stage (blood_request_id, donor_user_id, notification_stage)
      ) ENGINE=InnoDB;
    `);

    // 2. Ensure Roles has BLOOD_DONOR
    await pool.query(`
      INSERT IGNORE INTO roles (code, name, description)
      VALUES ('BLOOD_DONOR', 'Blood Donor', 'Verified blood donor')
    `);

    // 3. Seed Blood Groups
    const [existingGroups] = await pool.query('SELECT COUNT(*) as count FROM blood_groups');
    if (existingGroups[0].count === 0) {
      console.log(' Seeding Blood Groups...');
      await pool.query(`
        INSERT INTO blood_groups (code, name) VALUES
        ('A+', 'A Positive'),
        ('A-', 'A Negative'),
        ('B+', 'B Positive'),
        ('B-', 'B Negative'),
        ('AB+', 'AB Positive'),
        ('AB-', 'AB Negative'),
        ('O+', 'O Positive'),
        ('O-', 'O Negative');
      `);
      console.log(' Blood Groups seeded successfully.');
    }

    console.log(' Blood Database tables initialized successfully.');
  } catch (error) {
    console.error(' Error initializing Blood Database:', error);
  }
};

module.exports = { initBloodDb };
