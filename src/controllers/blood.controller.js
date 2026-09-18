const bloodService = require('../services/blood.service');

class BloodController {
  /**
   * Get all blood groups
   */
  async getBloodGroups(req, res, next) {
    try {
      const groups = await bloodService.getBloodGroups();
      res.status(200).json({
        success: true,
        data: groups
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user's donor profile
   */
  async getMyDonorProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await bloodService.getMyDonorProfile(userId);
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply / Register as a Blood Donor
   */
  async applyAsDonor(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await bloodService.applyAsDonor(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Blood donor application submitted successfully. Verification in progress.',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle donor availability
   */
  async updateAvailability(req, res, next) {
    try {
      const userId = req.user.id;
      const { availability } = req.body;
      const result = await bloodService.updateDonorAvailability(userId, availability);
      res.status(200).json({
        success: true,
        message: `Availability updated to ${availability}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update donor profile info
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await bloodService.updateDonorProfile(userId, req.body);
      res.status(200).json({
        success: true,
        message: 'Donor profile updated successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get all donors
   */
  async getAdminDonors(req, res, next) {
    try {
      const { search, bloodGroup, status, limit, offset } = req.query;
      const result = await bloodService.getAdminDonorsList({
        search,
        bloodGroup,
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
   * Admin: Review and verify/reject donor
   */
  async reviewDonor(req, res, next) {
    try {
      const { userId } = req.params;
      const { status, notes } = req.body;
      const reviewerId = req.user.id;

      const result = await bloodService.reviewDonorVerification(userId, {
        status,
        notes,
        reviewerId
      });

      res.status(200).json({
        success: true,
        message: `Donor verification status updated to ${status}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create an urgent blood request
   */
  async createBloodRequest(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await bloodService.createBloodRequest(userId, req.body);
      res.status(201).json({
        success: true,
        message: `Blood request created successfully. Alerted ${result.matchedDonorsCount} compatible donors nearby.`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Public: Get blood requests
   */
  async getBloodRequests(req, res, next) {
    try {
      const { bloodGroup, status, search, latitude, longitude, limit, offset } = req.query;
      const result = await bloodService.getPublicBloodRequests({
        bloodGroup,
        status,
        search,
        latitude,
        longitude,
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
   * Get single blood request
   */
  async getBloodRequestById(req, res, next) {
    try {
      const { id } = req.params;
      const request = await bloodService.getBloodRequestById(id);
      res.status(200).json({
        success: true,
        data: request
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update blood request status
   */
  async updateBloodRequestStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.id;
      const isAdmin = req.user.roles?.includes('ADMIN');

      const result = await bloodService.updateBloodRequestStatus(id, userId, status, isAdmin);
      res.status(200).json({
        success: true,
        message: `Blood request status updated to ${status}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get matches for logged-in donor
   */
  async getDonorMatches(req, res, next) {
    try {
      const userId = req.user.id;
      const matches = await bloodService.getDonorMatches(userId);
      res.status(200).json({
        success: true,
        data: matches
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Respond to blood match (ACCEPT / DECLINE)
   */
  async respondToBloodMatch(req, res, next) {
    try {
      const { matchId } = req.params;
      const { status } = req.body;
      const userId = req.user.id;

      const result = await bloodService.respondToBloodMatch(matchId, userId, status);
      res.status(200).json({
        success: true,
        message: `Match response updated to ${status}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Public: Search verified donors
   */
  async searchVerifiedDonors(req, res, next) {
    try {
      const { bloodGroup, division, district, search, limit, offset } = req.query;
      const result = await bloodService.searchVerifiedDonors({
        bloodGroup,
        division,
        district,
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
}

module.exports = new BloodController();
