// src/services/ad/adTargetingService.js
import { AD_CATEGORIES, AI_SEGMENTS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

/**
 * Ad Targeting Service
 * Manages targeting options and validation
 */
class AdTargetingService {
  /**
   * Get available targeting options
   */
  getTargetingOptions() {
    return {
      categories: AD_CATEGORIES.map(c => ({
        id: c.id,
        name: { uz: c.nameUz, ru: c.nameRu, en: c.nameEn },
        multiplier: c.multiplier,
      })),
      aiSegments: AI_SEGMENTS.map(s => ({
        id: s.id,
        name: { uz: s.nameUz, ru: s.nameRu, en: s.nameEn },
        description: s.description,
        multiplier: s.multiplier,
      })),
      languages: ['uz', 'ru', 'en'],
      frequencies: ['unique', 'daily', 'weekly', 'monthly'],
    };
  }

  /**
   * Validate targeting configuration
   */
  validateTargeting(targeting) {
    const errors = [];

    // Validate categories
    if (targeting.categories) {
      const validCategories = AD_CATEGORIES.map(c => c.id);
      const invalidCategories = targeting.categories.filter(
        c => !validCategories.includes(c)
      );
      if (invalidCategories.length > 0) {
        errors.push(`Invalid categories: ${invalidCategories.join(', ')}`);
      }
    }

    // Validate AI segments
    if (targeting.aiSegments) {
      const validSegments = AI_SEGMENTS.map(s => s.id);
      const invalidSegments = targeting.aiSegments.filter(
        s => !validSegments.includes(s)
      );
      if (invalidSegments.length > 0) {
        errors.push(`Invalid AI segments: ${invalidSegments.join(', ')}`);
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
  getTargetingSummary(targeting) {
    const summary = {
      categories: [],
      aiSegments: [],
      languages: targeting.languages || ['uz', 'ru', 'en'],
      frequency: targeting.frequency || 'unique',
      estimatedMultiplier: 1.0,
    };

    // Add category details
    if (targeting.categories) {
      summary.categories = targeting.categories.map(catId => {
        const category = AD_CATEGORIES.find(c => c.id === catId);
        return {
          id: catId,
          name: category?.nameEn || catId,
          multiplier: category?.multiplier || 1,
        };
      });
    }

    // Add AI segment details
    if (targeting.aiSegments) {
      summary.aiSegments = targeting.aiSegments.map(segId => {
        const segment = AI_SEGMENTS.find(s => s.id === segId);
        return {
          id: segId,
          name: segment?.nameEn || segId,
          multiplier: segment?.multiplier || 1,
        };
      });
    }

    // Calculate total multiplier
    const categoryMultipliers = summary.categories.map(c => c.multiplier);
    const segmentMultipliers = summary.aiSegments.map(s => s.multiplier);
    
    const maxCategoryMult = Math.max(...categoryMultipliers, 1);
    const maxSegmentMult = Math.max(...segmentMultipliers, 1);
    
    summary.estimatedMultiplier = maxCategoryMult * maxSegmentMult;

    return summary;
  }
}

const adTargetingService = new AdTargetingService();
export default adTargetingService;