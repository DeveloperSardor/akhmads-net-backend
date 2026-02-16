// src/services/analytics/exportService.js
import ExcelJS from 'exceljs';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Export Service
 * Exports data to Excel/CSV
 */
class ExportService {
  /**
   * Export impressions to Excel
   */
  async exportImpressionsToExcel(adId) {
    try {
      const impressions = await prisma.impression.findMany({
        where: { adId },
        include: {
          bot: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Impressions');

      // Headers
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Дата и время', key: 'datetime', width: 20 },
        { header: 'Бот', key: 'bot', width: 20 },
        { header: 'Пользователь', key: 'userId', width: 15 },
        { header: 'Имя', key: 'firstName', width: 15 },
        { header: 'Фамилия', key: 'lastName', width: 15 },
        { header: 'Username', key: 'username', width: 20 },
        { header: 'Язык', key: 'language', width: 10 },
      ];

      // Data
      impressions.forEach((imp, index) => {
        worksheet.addRow({
          id: index + 1,
          datetime: imp.createdAt.toLocaleString('ru-RU'),
          bot: `@${imp.bot.username}`,
          userId: imp.telegramUserId || '',
          firstName: imp.firstName || '',
          lastName: imp.lastName || '',
          username: imp.username ? `@${imp.username}` : '',
          language: imp.languageCode || '',
        });
      });

      // Style
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      logger.error('Export impressions to Excel failed:', error);
      throw error;
    }
  }

  /**
   * Export clicks to Excel
   */
  async exportClicksToExcel(adId) {
    try {
      const clicks = await prisma.clickEvent.findMany({
        where: { adId, clicked: true },
        include: {
          bot: { select: { username: true } },
        },
        orderBy: { clickedAt: 'desc' },
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Clicks');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Дата и время', key: 'datetime', width: 20 },
        { header: 'Бот', key: 'bot', width: 20 },
        { header: 'Пользователь', key: 'userId', width: 15 },
        { header: 'IP Address', key: 'ip', width: 15 },
        { header: 'User Agent', key: 'userAgent', width: 40 },
        { header: 'URL', key: 'url', width: 50 },
      ];

      clicks.forEach((click, index) => {
        worksheet.addRow({
          id: index + 1,
          datetime: click.clickedAt.toLocaleString('ru-RU'),
          bot: `@${click.bot.username}`,
          userId: click.telegramUserId || '',
          ip: click.ipAddress || '',
          userAgent: click.userAgent || '',
          url: click.originalUrl,
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      logger.error('Export clicks to Excel failed:', error);
      throw error;
    }
  }
}

const exportService = new ExportService();
export default exportService;