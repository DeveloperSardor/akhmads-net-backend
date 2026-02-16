import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * FAQ Service
 * FAQ management
 */
class FaqService {
  /**
   * Get FAQs
   */
  async getFaqs(category = null) {
    try {
      const where = { isActive: true };
      if (category) where.category = category;

      return await prisma.faq.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      logger.error('Get FAQs failed:', error);
      throw error;
    }
  }

  /**
   * Create FAQ (admin)
   */
  async createFaq(data) {
    try {
      return await prisma.faq.create({
        data: {
          category: data.category,
          question: JSON.stringify(data.question),
          answer: JSON.stringify(data.answer),
          sortOrder: data.sortOrder || 0,
        },
      });
    } catch (error) {
      logger.error('Create FAQ failed:', error);
      throw error;
    }
  }
}

const faqService = new FaqService();
export default faqService;