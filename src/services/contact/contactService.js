import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Contact Service
 * Contact form management
 */
class ContactService {
  /**
   * Submit contact message
   */
  async submitMessage(data) {
    try {
      const message = await prisma.contactMessage.create({
        data: {
          userId: data.userId,
          name: data.name,
          email: data.email,
          subject: data.subject || 'General Inquiry',
          message: data.message,
          status: 'new',
        },
      });

      logger.info(`Contact message submitted: ${message.id}`);
      return message;
    } catch (error) {
      logger.error('Submit contact message failed:', error);
      throw error;
    }
  }

  /**
   * Get messages (admin)
   */
  async getMessages(filters = {}) {
    try {
      const { status, limit = 50, offset = 0 } = filters;

      const where = {};
      if (status) where.status = status;

      const messages = await prisma.contactMessage.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.contactMessage.count({ where });

      return { messages, total };
    } catch (error) {
      logger.error('Get contact messages failed:', error);
      throw error;
    }
  }
  /**
   * Update message status
   */
  async updateMessageStatus(id, status) {
    try {
      const message = await prisma.contactMessage.update({
        where: { id },
        data: { status },
      });
      return message;
    } catch (error) {
      logger.error('Update contact message status failed:', error);
      throw error;
    }
  }
}

const contactService = new ContactService();
export default contactService;