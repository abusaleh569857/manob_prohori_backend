const bloodRepository = require('../repositories/blood.repository');

class BloodService {
  /**
   * Get all blood groups
   */
  async getBloodGroups() {
    return await bloodRepository.getBloodGroups();
  }

  /**
   * Get logged-in user's donor profile
   */
  async getMyDonorProfile(userId) {
    const profile = await bloodRepository.getDonorProfile(userId);
    return profile;
  }

  /**
   * Apply / Register as a Blood Donor
   */
  async applyAsDonor(userId, data) {
    const { bloodGroupId, documentUrl } = data;
    if (!bloodGroupId) {
      throw new Error('Blood group is required');
    }
    if (!documentUrl) {
      throw new Error('Verification blood report document is required');
    }

    return await bloodRepository.applyAsDonor(userId, data);
  }

  /**
   * Toggle donor availability
   */
  async updateDonorAvailability(userId, availability) {
    if (!['AVAILABLE', 'UNAVAILABLE'].includes(availability)) {
      throw new Error('Invalid availability status. Must be AVAILABLE or UNAVAILABLE');
    }
    return await bloodRepository.updateDonorAvailability(userId, availability);
  }

  /**
   * Update donor profile details
   */
  async updateDonorProfile(userId, updateData) {
    return await bloodRepository.updateDonorProfile(userId, updateData);
  }

  /**
   * Admin: Get donors list
   */
  async getAdminDonorsList(params) {
    return await bloodRepository.getAdminDonorsList(params);
  }

  /**
   * Admin: Review and verify/reject donor
   */
  async reviewDonorVerification(donorUserId, { status, notes, reviewerId }) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new Error('Status must be APPROVED or REJECTED');
    }
    return await bloodRepository.reviewDonorVerification(donorUserId, { status, notes, reviewerId });
  }

  /**
   * Create an urgent blood request with automated proximity matching
   */
  async createBloodRequest(userId, requestData) {
    const {
      bloodGroupId,
      requiredUnits = 1.0,
      latitude,
      longitude,
      hospitalName,
      addressText,
      contactPhone
    } = requestData;

    if (!bloodGroupId) {
      throw new Error('Blood group is required');
    }
    if (!latitude || !longitude) {
      throw new Error('GPS coordinates (latitude, longitude) are required for emergency matching');
    }

    // 1. Create request record
    const requestId = await bloodRepository.createBloodRequest({
      requestedBy: userId,
      ...requestData
    });

    // 2. Automated Proximity Matching Engine (find compatible, approved, available donors within 30km)
    let matchedDonors = [];
    try {
      matchedDonors = await bloodRepository.findMatchingDonors(
        bloodGroupId,
        Number(latitude),
        Number(longitude),
        30, // 30km radius
        20  // top 20 closest donors
      );

      if (matchedDonors.length > 0) {
        await bloodRepository.createBloodRequestMatches(requestId, matchedDonors);
      }
    } catch (matchingError) {
      console.error('Proximity matching error (non-fatal):', matchingError);
    }

    const createdRequest = await bloodRepository.getBloodRequestById(requestId);
    return {
      request: createdRequest,
      matchedDonorsCount: matchedDonors.length
    };
  }

  /**
   * Public: Get blood requests
   */
  async getPublicBloodRequests(params) {
    return await bloodRepository.getPublicBloodRequests(params);
  }

  /**
   * Get single request
   */
  async getBloodRequestById(id) {
    const request = await bloodRepository.getBloodRequestById(id);
    if (!request) {
      throw new Error('Blood request not found');
    }
    return request;
  }

  /**
   * Update request status
   */
  async updateBloodRequestStatus(requestId, userId, status, isAdmin = false) {
    if (!['OPEN', 'FULFILLED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      throw new Error('Invalid blood request status');
    }
    const updated = await bloodRepository.updateBloodRequestStatus(requestId, userId, status, isAdmin);
    if (!updated) {
      throw new Error('Failed to update blood request status or unauthorized');
    }
    return { success: true, status };
  }

  /**
   * Get matched requests for donor
   */
  async getDonorMatches(donorUserId) {
    return await bloodRepository.getDonorMatches(donorUserId);
  }

  /**
   * Respond to match (ACCEPT / DECLINE)
   */
  async respondToBloodMatch(matchId, donorUserId, status) {
    if (!['ACCEPTED', 'DECLINED'].includes(status)) {
      throw new Error('Status must be ACCEPTED or DECLINED');
    }
    const updated = await bloodRepository.respondToBloodMatch(matchId, donorUserId, status);
    if (!updated) {
      throw new Error('Failed to respond to match or not found');
    }
    return { success: true, matchId, status };
  }

  /**
   * Search verified donors
   */
  async searchVerifiedDonors(params) {
    return await bloodRepository.searchVerifiedDonors(params);
  }
}

module.exports = new BloodService();
