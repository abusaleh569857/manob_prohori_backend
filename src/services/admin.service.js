const auditRepository = require('../repositories/audit.repository');

class AdminService {
  async getAuditLogs(filters) {
    return await auditRepository.getAuditLogs(filters);
  }

  async getAllUsers(filters) {
    return await auditRepository.getAllUsers(filters);
  }

  async toggleUserStatus(userId, isActive, adminUserId) {
    const updated = await auditRepository.toggleUserStatus(userId, isActive);
    if (updated) {
      await auditRepository.createLog({
        actorUserId: adminUserId,
        action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: userId,
        newValues: { isActive }
      });
    }
    return updated;
  }
}

module.exports = new AdminService();
