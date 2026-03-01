import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

class CategoryService {
  /**
   * Get all active categories (public)
   */
  async getAll() {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Get all categories including inactive (admin)
   */
  async getAllAdmin() {
    return prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Create a new category
   */
  async create(data) {
    return prisma.category.create({
      data: {
        slug: data.slug,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        nameEn: data.nameEn,
        icon: data.icon || '📌',
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  /**
   * Update a category
   */
  async update(id, data) {
    return prisma.category.update({
      where: { id },
      data: {
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.nameUz !== undefined && { nameUz: data.nameUz }),
        ...(data.nameRu !== undefined && { nameRu: data.nameRu }),
        ...(data.nameEn !== undefined && { nameEn: data.nameEn }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /**
   * Delete a category
   */
  async delete(id) {
    return prisma.category.delete({ where: { id } });
  }
}

const categoryService = new CategoryService();
export default categoryService;
