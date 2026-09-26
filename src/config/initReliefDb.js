const { pool } = require('./db');

/**
 * Initialize Relief Requests, Documents, Verification, and Peer-to-Peer Donation tables
 */
const initReliefDb = async () => {
  try {
    // 1. Create Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS relief_requests (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        requested_by BIGINT UNSIGNED NOT NULL,
        incident_id BIGINT UNSIGNED NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        required_amount DECIMAL(14,2) NULL,
        current_amount DECIMAL(14,2) NULL DEFAULT 0.00,
        bkash_number VARCHAR(30) NULL,
        nagad_number VARCHAR(30) NULL,
        rocket_number VARCHAR(30) NULL,
        contact_phone VARCHAR(30) NULL,
        address_text VARCHAR(500) NULL,
        latitude DECIMAL(10,7) NULL,
        longitude DECIMAL(10,7) NULL,
        status ENUM('PENDING','UNDER_REVIEW','APPROVED','REJECTED','CLOSED','EXPIRED') NOT NULL DEFAULT 'PENDING',
        public_visibility BOOLEAN NOT NULL DEFAULT FALSE,
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME NULL,
        reviewed_by BIGINT UNSIGNED NULL,
        rejection_reason VARCHAR(1000) NULL,
        closed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_relief_public (status, public_visibility),
        INDEX idx_relief_requester (requested_by)
      ) ENGINE=InnoDB;
    `);

    // Ensure current_amount column exists if table was created previously without it
    try {
      await pool.query(`
        ALTER TABLE relief_requests 
        ADD COLUMN current_amount DECIMAL(14,2) NULL DEFAULT 0.00 AFTER required_amount
      `);
    } catch (colErr) {
      // Column already exists, ignore
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS relief_request_documents (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        relief_request_id BIGINT UNSIGNED NOT NULL,
        document_type ENUM('IDENTITY','MEDICAL','POLICE_REPORT','INCIDENT_PROOF','OTHER') NOT NULL DEFAULT 'INCIDENT_PROOF',
        file_url VARCHAR(500) NOT NULL,
        uploaded_by BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (relief_request_id) REFERENCES relief_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS relief_request_verifications (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        relief_request_id BIGINT UNSIGNED NOT NULL,
        status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        notes VARCHAR(1500) NULL,
        reviewed_by BIGINT UNSIGNED NULL,
        reviewed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (relief_request_id) REFERENCES relief_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS relief_donations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        relief_request_id BIGINT UNSIGNED NOT NULL,
        donor_user_id BIGINT UNSIGNED NULL,
        donor_name VARCHAR(150) NULL,
        donor_phone VARCHAR(50) NULL,
        amount DECIMAL(14,2) NOT NULL,
        payment_method ENUM('BKASH','NAGAD','ROCKET','BANK','CASH_HANDOVER','OTHER') NOT NULL DEFAULT 'BKASH',
        transaction_reference VARCHAR(100) NULL,
        status ENUM('REPORTED','CONFIRMED','REJECTED') NOT NULL DEFAULT 'CONFIRMED',
        donated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (relief_request_id) REFERENCES relief_requests(id) ON DELETE CASCADE,
        INDEX idx_donation_relief (relief_request_id)
      ) ENGINE=InnoDB;
    `);

    // 2. Check and Seed Initial Verified Relief Campaigns if empty
    const [existingRelief] = await pool.query('SELECT COUNT(*) as count FROM relief_requests');
    if (existingRelief[0].count === 0) {
      console.log(' Seeding Initial Verified Relief Campaigns...');
      // Get an admin user id or first user id to be requester/reviewer
      const [users] = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
      const userId = users[0]?.id || 1;

      const sampleRelief = [
        {
          title: 'Feni Floods Emergency Rehabilitation & Clean Drinking Water',
          description: 'Flash floods have submerged over 60 villages in Fulgazi and Parshuram upazilas of Feni. Urgent drinking water purification tablets, baby food, dry rations, and basic roof reconstruction materials are desperately needed for 250 displaced families.',
          required_amount: 150000.00,
          current_amount: 82500.00,
          bkash_number: '01819234567',
          nagad_number: '01819234567',
          rocket_number: '018192345672',
          contact_phone: '01819234567',
          address_text: 'Fulgazi Upazila, Feni, Chittagong',
          latitude: 23.0160,
          longitude: 91.3980,
          status: 'APPROVED',
          public_visibility: true
        },
        {
          title: 'Sunamganj Haor Flash Flood Medical & Dry Ration Aid',
          description: 'Rising water levels in the Surma river basin have stranded several char communities in Tahirpur and Doarabazar. Families have lost stored grains and cattle feed. Direct cash assistance is helping community elders purchase dry rice and water containers.',
          required_amount: 95000.00,
          current_amount: 64000.00,
          bkash_number: '01711987654',
          nagad_number: '01711987654',
          rocket_number: '017119876541',
          contact_phone: '01711987654',
          address_text: 'Tahirpur Haor Region, Sunamganj, Sylhet',
          latitude: 25.0833,
          longitude: 91.1833,
          status: 'APPROVED',
          public_visibility: true
        },
        {
          title: 'Kurigram Jamuna River Erosion Family Relocation Support',
          description: 'Severe erosion along the Jamuna River banks in Chilmari has washed away 18 homesteads in 48 hours. Affected landless families are currently sheltering on flood embankments without kitchen facilities or sanitary toilets.',
          required_amount: 75000.00,
          current_amount: 31000.00,
          bkash_number: '01912334455',
          nagad_number: '01912334455',
          rocket_number: '019123344558',
          contact_phone: '01912334455',
          address_text: 'Chilmari Embankment, Kurigram, Rangpur',
          latitude: 25.5667,
          longitude: 89.6667,
          status: 'APPROVED',
          public_visibility: true
        }
      ];

      for (const r of sampleRelief) {
        const [insertRes] = await pool.query(`
          INSERT INTO relief_requests 
            (requested_by, title, description, required_amount, current_amount, bkash_number, nagad_number, rocket_number, contact_phone, address_text, latitude, longitude, status, public_visibility, reviewed_at, reviewed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
        `, [
          userId,
          r.title,
          r.description,
          r.required_amount,
          r.current_amount,
          r.bkash_number,
          r.nagad_number,
          r.rocket_number,
          r.contact_phone,
          r.address_text,
          r.latitude,
          r.longitude,
          r.status,
          r.public_visibility,
          userId
        ]);

        // Add dummy proof document
        await pool.query(`
          INSERT INTO relief_request_documents 
            (relief_request_id, document_type, file_url, uploaded_by)
          VALUES (?, 'INCIDENT_PROOF', 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&q=80&w=800', ?)
        `, [insertRes.insertId, userId]);
      }

      console.log(' Verified Relief Campaigns seeded successfully.');
    }

    console.log(' Relief Database tables initialized successfully.');
  } catch (error) {
    console.error(' Error initializing Relief Database:', error);
  }
};

module.exports = { initReliefDb };
