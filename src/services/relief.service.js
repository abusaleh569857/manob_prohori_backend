const reliefRepository = require('../repositories/relief.repository');

class ReliefService {
  /**
   * Submit a new Relief Request
   */
  async createReliefRequest(userId, requestData) {
    const { title, description, requiredAmount, contactPhone } = requestData;

    if (!title || title.trim().length < 5) {
      throw new Error('Please provide a clear title for the relief request');
    }
    if (!description || description.trim().length < 20) {
      throw new Error('Please describe the emergency situation in detail (min 20 characters)');
    }
    if (!requiredAmount || Number(requiredAmount) <= 0) {
      throw new Error('Please specify a valid required relief amount in BDT');
    }
    if (!contactPhone) {
      throw new Error('A contact phone number is required');
    }

    return await reliefRepository.createReliefRequest(userId, requestData);
  }

  /**
   * Get public verified campaigns
   */
  async getPublicReliefRequests(params) {
    return await reliefRepository.getPublicReliefRequests(params);
  }

  /**
   * Get single relief request details
   */
  async getReliefRequestById(id) {
    const relief = await reliefRepository.getReliefRequestById(id);
    if (!relief) {
      throw new Error('Relief campaign not found');
    }
    return relief;
  }

  /**
   * Get logged-in user's submitted requests
   */
  async getUserReliefRequests(userId) {
    return await reliefRepository.getUserReliefRequests(userId);
  }

  /**
   * Admin: List all relief requests
   */
  async getAdminReliefRequests(params) {
    return await reliefRepository.getAdminReliefRequests(params);
  }

  /**
   * Admin: Review and approve/reject
   */
  async reviewReliefRequest(id, reviewData) {
    const { status, publicVisibility, notes, rejectionReason, reviewerId } = reviewData;
    if (!['APPROVED', 'REJECTED', 'UNDER_REVIEW', 'CLOSED'].includes(status)) {
      throw new Error('Invalid relief review status');
    }

    return await reliefRepository.reviewReliefRequest(id, {
      status,
      publicVisibility,
      notes,
      rejectionReason,
      reviewerId
    });
  }

  /**
   * Record a peer-to-peer donation contribution
   */
  async recordDonationContribution(reliefRequestId, donorUserId, contributionData) {
    const { amount, paymentMethod, transactionReference } = contributionData;
    if (!amount || Number(amount) <= 0) {
      throw new Error('Please enter a valid donation amount');
    }

    return await reliefRepository.recordDonationContribution(
      reliefRequestId,
      donorUserId,
      contributionData
    );
  }
}

module.exports = new ReliefService();
