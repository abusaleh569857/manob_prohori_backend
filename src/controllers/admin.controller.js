const adminService = require('../services/admin.service');

class AdminController {
  async getAuditLogs(req, res) {
    try {
      const { search, entityType, action, limit = 50, offset = 0 } = req.query;

      const result = await adminService.getAuditLogs({
        search,
        entityType,
        action,
        limit: Number(limit),
        offset: Number(offset)
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch audit logs'
      });
    }
  }

  async getAllUsers(req, res) {
    try {
      const { search, limit = 50, offset = 0 } = req.query;

      const result = await adminService.getAllUsers({
        search,
        limit: Number(limit),
        offset: Number(offset)
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching admin users:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  }

  async toggleUserStatus(req, res) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const { isActive } = req.body;

      const updated = await adminService.toggleUserStatus(id, isActive, adminUserId);

      return res.status(200).json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { updated }
      });
    } catch (error) {
      console.error('Error toggling user status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to toggle user status'
      });
    }
  }
}

module.exports = new AdminController();
