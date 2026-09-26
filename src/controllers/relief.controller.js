const reliefService = require('../services/relief.service');

class ReliefController {
  /**
   * Submit a new Relief Request
   */
  async createReliefRequest(req, res, next) {
    try {
      const userId = req.user.id;
      const reliefId = await reliefService.createReliefRequest(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Emergency relief request submitted successfully. Awaiting administrator verification.',
        data: { id: reliefId }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get public approved relief campaigns
   */
  async getPublicReliefRequests(req, res, next) {
    try {
      const { search, limit, offset } = req.query;
      const result = await reliefService.getPublicReliefRequests({
        search,
        limit,
        offset
      });
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single relief request by ID
   */
  async getReliefRequestById(req, res, next) {
    try {
      const { id } = req.params;
      const relief = await reliefService.getReliefRequestById(id);
      res.status(200).json({
        success: true,
        data: relief
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get logged-in user's relief requests
   */
  async getUserReliefRequests(req, res, next) {
    try {
      const userId = req.user.id;
      const requests = await reliefService.getUserReliefRequests(userId);
      res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Record a direct donation contribution
   */
  async recordDonation(req, res, next) {
    try {
      const { id } = req.params;
      const donorUserId = req.user?.id || null;
      const result = await reliefService.recordDonationContribution(id, donorUserId, req.body);
      res.status(200).json({
        success: true,
        message: 'Thank you! Your donation report has been recorded to update the public progress.',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: List all relief requests
   */
  async getAdminReliefRequests(req, res, next) {
    try {
      const { search, status, limit, offset } = req.query;
      const result = await reliefService.getAdminReliefRequests({
        search,
        status,
        limit,
        offset
      });
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Review and approve/reject
   */
  async reviewReliefRequest(req, res, next) {
    try {
      const { id } = req.params;
      const { status, publicVisibility, notes, rejectionReason } = req.body;
      const reviewerId = req.user.id;

      const result = await reliefService.reviewReliefRequest(id, {
        status,
        publicVisibility,
        notes,
        rejectionReason,
        reviewerId
      });

      res.status(200).json({
        success: true,
        message: `Relief request status updated to ${status}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReliefController();
