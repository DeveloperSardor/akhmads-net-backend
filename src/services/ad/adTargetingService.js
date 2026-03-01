// src/services/ad/adTargetingService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Ad Targeting Service
 * Manages targeting options and validation
 */
class AdTargetingService {
  /**
   * Get available targeting options (categories from DB)
   */
  async getTargetingOptions() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      categories: categories.map(c => ({
        id: c.slug,
        name: { uz: c.nameUz, ru: c.nameRu, en: c.nameEn },
        icon: c.icon,
        multiplier: 1,
      })),
      aiSegments: categories.map(c => ({
        id: c.slug,
        name: { uz: c.nameUz, ru: c.nameRu, en: c.nameEn },
        icon: c.icon,
        description: c.nameUz,
        multiplier: 1,
      })),
      languages: ['uz', 'ru', 'en'],
      frequencies: ['unique', 'daily', 'weekly', 'monthly'],
    };
  }

  /**
   * Validate targeting configuration
   */
  async validateTargeting(targeting) {
    const errors = [];

    if (targeting.categories) {
      const dbCategories = await prisma.category.findMany({ where: { isActive: true } });
      const validSlugs = dbCategories.map(c => c.slug);
      const invalidCategories = targeting.categories.filter(
        c => !validSlugs.includes(c)
      );
      if (invalidCategories.length > 0) {
        errors.push(`Invalid categories: ${invalidCategories.join(', ')}`);
      }
    }

    // Validate languages
    if (targeting.languages) {
      const validLanguages = ['uz', 'ru', 'en'];
      const invalidLanguages = targeting.languages.filter(
        l => !validLanguages.includes(l)
      );
      if (invalidLanguages.length > 0) {
        errors.push(`Invalid languages: ${invalidLanguages.join(', ')}`);
      }
    }

    return errors;
  }

  /**
   * Get targeting summary
   */
  async getTargetingSummary(targeting) {
    const summary = {
      categories: [],
      aiSegments: [],
      languages: targeting.languages || ['uz', 'ru', 'en'],
      frequency: targeting.frequency || 'unique',
      estimatedMultiplier: 1.0,
    };

    // Add category details from DB
    if (targeting.categories && targeting.categories.length > 0) {
      const dbCategories = await prisma.category.findMany({
        where: { slug: { in: targeting.categories }, isActive: true },
      });

      summary.categories = targeting.categories.map(catSlug => {
        const category = dbCategories.find(c => c.slug === catSlug);
        return {
          id: catSlug,
          name: category?.nameEn || catSlug,
          multiplier: 1,
        };
      });
    }

    // Calculate total multiplier
    summary.estimatedMultiplier = 1.0;

    return summary;
  }
}

const adTargetingService = new AdTargetingService();
export default adTargetingService;