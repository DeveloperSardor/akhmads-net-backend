import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Audit Service
 * Audit logging
 */
class AuditService {
  /**
   * Log action
   */
  async log(data) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          changes: data.changes ? JSON.stringify(data.changes) : null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      });
    } catch (error) {
      logger.error('Audit log failed:', error);
    }
  }
}

const auditService = new AuditService();
export default auditService;