const { pool } = require('./db');

/**
 * Initialize Hospital and Emergency Service Directory tables and seed data
 */
const initHospitalAndServicesDb = async () => {
  try {
    // 1. Create Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        external_source VARCHAR(100) NULL,
        external_facility_id VARCHAR(100) NULL,
        name VARCHAR(255) NOT NULL,
        name_bn VARCHAR(255) NULL,
        facility_type VARCHAR(120) NULL DEFAULT 'General Hospital',
        ownership VARCHAR(80) NULL DEFAULT 'Government',
        phone VARCHAR(100) NULL,
        email VARCHAR(255) NULL,
        address_text VARCHAR(500) NULL,
        division VARCHAR(120) NULL,
        district VARCHAR(120) NULL,
        upazila VARCHAR(120) NULL,
        city VARCHAR(120) NULL,
        postal_code VARCHAR(20) NULL,
        latitude DECIMAL(10,7) NULL,
        longitude DECIMAL(10,7) NULL,
        emergency_available BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_synced_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_hospital_geo (latitude, longitude),
        INDEX idx_hospital_area (district, upazila),
        INDEX idx_hospital_active_emergency (is_active, emergency_available)
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS specialties (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        slug VARCHAR(140) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospital_specialties (
        hospital_id BIGINT UNSIGNED NOT NULL,
        specialty_id INT UNSIGNED NOT NULL,
        PRIMARY KEY (hospital_id, specialty_id),
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        FOREIGN KEY (specialty_id) REFERENCES specialties(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospital_services (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        hospital_id BIGINT UNSIGNED NOT NULL,
        service_name VARCHAR(150) NOT NULL,
        phone VARCHAR(100) NULL,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        notes VARCHAR(500) NULL,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        INDEX idx_hospital_services (hospital_id, is_available)
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_services (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        service_type ENUM('AMBULANCE','POLICE','FIRE','NATIONAL_EMERGENCY','OTHER') NOT NULL,
        description VARCHAR(500) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_by BIGINT UNSIGNED NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_service_contacts (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        emergency_service_id INT UNSIGNED NOT NULL,
        region_name VARCHAR(150) NULL,
        phone_number VARCHAR(50) NOT NULL,
        display_label VARCHAR(150) NULL,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        FOREIGN KEY (emergency_service_id) REFERENCES emergency_services(id) ON DELETE CASCADE,
        INDEX idx_service_contacts (emergency_service_id, region_name)
      ) ENGINE=InnoDB;
    `);

    // 2. Seed Specialties if empty
    const [specRows] = await pool.query('SELECT COUNT(*) AS count FROM specialties');
    if (specRows[0].count === 0) {
      await pool.query(`
        INSERT IGNORE INTO specialties (name, slug) VALUES
        ('Emergency Medicine', 'emergency-medicine'),
        ('Trauma Care', 'trauma-care'),
        ('Burn Unit', 'burn-unit'),
        ('Cardiology / Heart', 'cardiology'),
        ('General Surgery', 'general-surgery'),
        ('Orthopedics', 'orthopedics'),
        ('Pediatrics / Child', 'pediatrics'),
        ('Neurology & Neurosurgery', 'neurology'),
        ('Obstetrics & Gynecology', 'obstetrics-gynecology'),
        ('ICU & Critical Care', 'icu-critical-care')
      `);
    }

    // 3. Seed Emergency Services & Contacts if empty
    const [esRows] = await pool.query('SELECT COUNT(*) AS count FROM emergency_services');
    if (esRows[0].count === 0) {
      await pool.query(`
        INSERT INTO emergency_services (id, name, service_type, description, sort_order) VALUES
        (1, 'National Emergency Hotline (999)', 'NATIONAL_EMERGENCY', 'Toll-free 24/7 central emergency hotline for Police, Fire, and Ambulance across Bangladesh', 10),
        (2, 'Ambulance Services', 'AMBULANCE', 'Emergency patient transport and critical care ambulance providers nationwide', 20),
        (3, 'Fire Service & Civil Defence', 'FIRE', 'Fire rescue, industrial accidents, chemical spills and disaster response', 30),
        (4, 'Bangladesh Police Control', 'POLICE', 'Emergency police response, security, highway assistance, and crime deterrence', 40)
        ON DUPLICATE KEY UPDATE name=VALUES(name);
      `);

      await pool.query(`
        INSERT INTO emergency_service_contacts (emergency_service_id, region_name, phone_number, display_label, is_primary) VALUES
        (1, 'Nationwide (All Bangladesh)', '999', 'National Emergency 999 (Toll-Free 24/7)', TRUE),
        (2, 'Nationwide / Central', '02-9330188', 'Bangladesh Red Crescent Ambulance', TRUE),
        (2, 'Dhaka Central', '01711000001', 'DMCH Emergency Ambulance Fleet', FALSE),
        (2, 'Nationwide / Low-Cost', '02-9336611', 'Anjuman Mufidul Islam Ambulance Service', FALSE),
        (2, 'Nationwide / Critical Care', '01711267869', 'Al-Markazul Islami Ambulance', FALSE),
        (3, 'Nationwide Hotline', '16163', 'Fire Service Central Control Hotline', TRUE),
        (3, 'Nationwide Alternative', '102', 'Fire Service Emergency Number', FALSE),
        (3, 'Dhaka Headquarters', '02-223355555', 'Fire Service & Civil Defence HQ Control Room', FALSE),
        (4, 'Dhaka Metropolitan', '02-223381188', 'DMP Central Control Room', TRUE),
        (4, 'Highway Assistance', '01769690033', 'Bangladesh Highway Police Emergency', FALSE),
        (4, 'Tourist Safety Support', '01320222222', 'Bangladesh Tourist Police Hotline', FALSE)
      `);
    }

    // 4. Seed Representative National Hospitals if empty
    const [hospRows] = await pool.query('SELECT COUNT(*) AS count FROM hospitals');
    if (hospRows[0].count === 0) {
      const initialHospitals = [
        {
          name: 'Dhaka Medical College Hospital (DMCH)',
          nameBn: 'ঢাকা মেডিকেল কলেজ হাসপাতাল',
          facilityType: 'Tertiary Specialized Hospital',
          ownership: 'Government',
          phone: '01711000001',
          email: 'dmch@gov.bd',
          addressText: 'Secretariat Road, Ramna, Dhaka-1000',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Ramna',
          latitude: 23.7258,
          longitude: 90.3976,
          emergencyAvailable: true,
        },
        {
          name: 'Sheikh Hasina National Institute of Burn and Plastic Surgery',
          nameBn: 'শেখ হাসিনা জাতীয় বার্ন ও প্লাস্টিক সার্জারি ইনস্টিটিউট',
          facilityType: 'Specialized Burn Hospital',
          ownership: 'Government',
          phone: '02-223381898',
          email: 'burninstitute@gov.bd',
          addressText: 'Chankharpul, Ramna, Dhaka-1000',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Ramna',
          latitude: 23.7225,
          longitude: 90.4005,
          emergencyAvailable: true,
        },
        {
          name: 'Square Hospital Dhaka',
          nameBn: 'স্কয়ার হাসপাতাল',
          facilityType: 'Multi-Specialty Hospital',
          ownership: 'Private',
          phone: '10616',
          email: 'info@squarehospital.com',
          addressText: '18/F, Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath, Dhaka-1205',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Kalabagan',
          latitude: 23.7533,
          longitude: 90.3817,
          emergencyAvailable: true,
        },
        {
          name: 'Evercare Hospital Dhaka',
          nameBn: 'এভারকেয়ার হাসপাতাল ঢাকা',
          facilityType: 'Tertiary Care Hospital',
          ownership: 'Private',
          phone: '10678',
          email: 'customercare@evercarebd.com',
          addressText: 'Plot 81, Block E, Bashundhara R/A, Dhaka-1229',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Bhatara',
          latitude: 23.8103,
          longitude: 90.4312,
          emergencyAvailable: true,
        },
        {
          name: 'National Institute of Traumatology & Orthopedic Rehabilitation (NITOR / Pangu)',
          nameBn: 'জাতীয় অর্থোপেডিক হাসপাতাল (পঙ্গু হাসপাতাল)',
          facilityType: 'Specialized Orthopedic Hospital',
          ownership: 'Government',
          phone: '02-9144190',
          email: 'nitor@gov.bd',
          addressText: 'Sher-e-Bangla Nagar, Agargaon, Dhaka-1207',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Sher-e-Bangla Nagar',
          latitude: 23.7712,
          longitude: 90.3701,
          emergencyAvailable: true,
        },
        {
          name: 'Chittagong Medical College Hospital (CMCH)',
          nameBn: 'চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল',
          facilityType: 'Tertiary Medical Hospital',
          ownership: 'Government',
          phone: '031-619400',
          email: 'cmch@gov.bd',
          addressText: '57 K.B. Fazlul Kader Road, Panchlaish, Chattogram-4203',
          division: 'Chittagong',
          district: 'Chittagong',
          upazila: 'Panchlaish',
          latitude: 22.3592,
          longitude: 91.8267,
          emergencyAvailable: true,
        },
        {
          name: 'Sylhet MAG Osmani Medical College Hospital',
          nameBn: 'সিলেট এম এ জি ওসমানী মেডিকেল কলেজ হাসপাতাল',
          facilityType: 'Tertiary Medical Hospital',
          ownership: 'Government',
          phone: '0821-713667',
          email: 'magomch@gov.bd',
          addressText: 'Medical College Road, Kajolshah, Sylhet-3100',
          division: 'Sylhet',
          district: 'Sylhet',
          upazila: 'Sylhet Sadar',
          latitude: 24.8996,
          longitude: 91.8548,
          emergencyAvailable: true,
        },
        {
          name: 'Rajshahi Medical College Hospital (RMCH)',
          nameBn: 'রাজশাহী মেডিকেল কলেজ হাসপাতাল',
          facilityType: 'Tertiary Medical Hospital',
          ownership: 'Government',
          phone: '0721-772150',
          email: 'rmch@gov.bd',
          addressText: 'Medical College Campus, Laxmipur, Rajshahi-6000',
          division: 'Rajshahi',
          district: 'Rajshahi',
          upazila: 'Rajpara',
          latitude: 24.3702,
          longitude: 88.5835,
          emergencyAvailable: true,
        },
        {
          name: 'Khulna Medical College Hospital (KMCH)',
          nameBn: 'খুলনা মেডিকেল কলেজ হাসপাতাল',
          facilityType: 'Tertiary Medical Hospital',
          ownership: 'Government',
          phone: '041-760350',
          email: 'kmch@gov.bd',
          addressText: 'Boyra Main Road, Boyra, Khulna-9000',
          division: 'Khulna',
          district: 'Khulna',
          upazila: 'Khalishpur',
          latitude: 22.8423,
          longitude: 89.5398,
          emergencyAvailable: true,
        },
        {
          name: 'Sher-e-Bangla Medical College Hospital (SBMCH)',
          nameBn: 'শের-ই-বাংলা মেডিকেল কলেজ হাসপাতাল',
          facilityType: 'Tertiary Medical Hospital',
          ownership: 'Government',
          phone: '0431-2173545',
          email: 'sbmch@gov.bd',
          addressText: 'Band Road, Barisal-8200',
          division: 'Barisal',
          district: 'Barisal',
          upazila: 'Kotwali',
          latitude: 22.6881,
          longitude: 90.3622,
          emergencyAvailable: true,
        }
      ];

      for (const h of initialHospitals) {
        const [res] = await pool.query(`
          INSERT INTO hospitals (
            name, name_bn, facility_type, ownership, phone, email,
            address_text, division, district, upazila, latitude, longitude, emergency_available, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [
          h.name, h.nameBn, h.facilityType, h.ownership, h.phone, h.email,
          h.addressText, h.division, h.district, h.upazila, h.latitude, h.longitude, h.emergencyAvailable
        ]);

        const hospId = res.insertId;

        // Attach representative emergency specialties (Emergency Medicine, Trauma Care, Surgery)
        await pool.query(`
          INSERT IGNORE INTO hospital_specialties (hospital_id, specialty_id)
          SELECT ?, id FROM specialties WHERE slug IN ('emergency-medicine', 'trauma-care', 'general-surgery')
        `, [hospId]);

        // Add 24/7 Emergency and Ambulance services
        await pool.query(`
          INSERT INTO hospital_services (hospital_id, service_name, phone, is_available, notes) VALUES
          (?, '24/7 Trauma & Emergency Admission', ?, TRUE, 'Immediate emergency triage and critical admission available round the clock'),
          (?, 'Dedicated Emergency Ambulance Call-center', ?, TRUE, 'Fast ambulance dispatch facility')
        `, [hospId, h.phone, hospId, h.phone]);
      }
    }

    console.log('✅ Hospital and Emergency Services tables and seed data initialized successfully.');
  } catch (err) {
    console.error('⚠️ Note on Hospital/Services DB Initialization:', err.message);
  }
};

module.exports = { initHospitalAndServicesDb };
