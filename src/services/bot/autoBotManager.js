import { Bot } from "grammy";
import prisma from "../../config/database.js";
import logger from "../../utils/logger.js";
import encryption from "../../utils/encryption.js";
import telegram from "../../config/telegram.js";
import socketService from "../socket/socketService.js";

import distributionService from "../distribution/distributionService.js";

class AutoBotManager {
  constructor() {
    this.bots = new Map(); // botId -> { botInstance, username }
  }

  /**
   * Initialize all AUTO bots
   */
  async init() {
    try {
      logger.info("🤖 Initializing AutoBotManager...");
      const autoBots = await prisma.bot.findMany({
        where: {
          integrationMode: "AUTO",
          status: "ACTIVE",
          isPaused: false,
        },
      });

      logger.info(`Found ${autoBots.length} AUTO bots to start.`);

      for (const botData of autoBots) {
        await this.startBot(botData);
      }
    } catch (error) {
      logger.error("❌ AutoBotManager init failed:", error);
    }
  }

  /**
   * Start a specific bot
   */
  async startBot(botData) {
    try {
      if (this.bots.has(botData.id)) {
        return;
      }

      if (!botData.tokenEncrypted) {
        logger.warn(`⚠️ Bot @${botData.username} has no token. Skipping.`);
        return;
      }

      const token = encryption.decrypt(botData.tokenEncrypted);
      const bot = new Bot(token);

      // Handle updates to collect user IDs and deliver ads
      const handleUpdate = async (ctx) => {
        try {
          const from = ctx.from;
          if (!from || from.is_bot) return;

          const { id, username, first_name, last_name, language_code } = from;
          const userIdentifier = username
            ? `@${username}`
            : first_name || `ID:${id}`;
          const botIdentifier = `@${botData.username}`;
          const text = ctx.message?.text || ctx.message?.caption || "";

          let actionType = "message";
          let actionEmoji = "💬";
          let logType = "bot";

          if (ctx.callback_query) {
            actionType = "click";
            actionEmoji = "🖱️ Button bosdi";
            logType = "warning";
          } else if (text.startsWith("/start")) {
            actionType = "start";
            actionEmoji = "🚀 /start bosdi";
            logType = "success";
          } else if (text.startsWith("/")) {
            actionType = "command";
            actionEmoji = `⌨️ ${text} yubordi`;
            logType = "info";
          } else if (ctx.message?.photo) {
            actionType = "photo";
            actionEmoji = "📷 Rasm yubordi";
            logType = "bot";
          } else if (ctx.message?.sticker) {
            actionType = "sticker";
            actionEmoji = `🎭 Sticker: ${ctx.message.sticker.emoji || ""}`;
            logType = "bot";
          } else if (ctx.message?.voice) {
            actionType = "voice";
            actionEmoji = "🎤 Ovozli xabar yubordi";
            logType = "bot";
          } else if (ctx.message?.video) {
            actionType = "video";
            actionEmoji = "🎬 Video yubordi";
            logType = "bot";
          } else if (ctx.message?.document) {
            actionType = "document";
            actionEmoji = "📄 Fayl yubordi";
            logType = "bot";
          } else if (ctx.message?.location) {
            actionType = "location";
            actionEmoji = "📍 Joylashuv yubordi";
            logType = "bot";
          } else if (ctx.message?.contact) {
            actionType = "contact";
            actionEmoji = "👤 Kontakt yubordi";
            logType = "bot";
          } else if (text) {
            actionType = "message";
            actionEmoji = `💬 "${text.length > 30 ? text.slice(0, 30) + "..." : text}"`;
            logType = "bot";
          }

          socketService.terminalLog(
            `${userIdentifier} → ${botIdentifier}: ${actionEmoji}`,
            logType,
            {
              botId: botData.id,
              botUsername: botData.username,
              userId: id,
              username: username,
              firstName: first_name,
              action: actionType,
              text,
            },
          );

          // Upsert BotUser
          await prisma.botUser.upsert({
            where: {
              botId_telegramUserId: {
                botId: botData.id,
                telegramUserId: id.toString(),
              },
            },
            update: {
              username: username || null,
              firstName: first_name || null,
              lastName: last_name || null,
              languageCode: language_code || null,
              lastSeenAt: new Date(),
            },
            create: {
              botId: botData.id,
              telegramUserId: id.toString(),
              username: username || null,
              firstName: first_name || null,
              lastName: last_name || null,
              languageCode: language_code || null,
            },
          });

          if (text.startsWith("/")) {
            return;
          }

          // Deliver ad
          await distributionService.deliverAd(
            botData.id,
            id.toString(),
            ctx.chat?.id || id, // Fallback to user ID if chat ID is missing
            language_code || null,
            {
              firstName: first_name,
              lastName: last_name,
              username: username,
            },
          );
        } catch (err) {
          logger.error(
            `Error processing update for @${botData.username}:`,
            err.message,
          );
        }
      };

      bot.on("message", handleUpdate);
      bot.on("callback_query", handleUpdate);

      // Catch bot level errors
      bot.catch((err) => {
        logger.error(`Error in bot @${botData.username}:`, err);

        const errorMessage = err.message || "";

        if (errorMessage.includes("401: Unauthorized")) {
          logger.warn(`Stopping unauthorized bot @${botData.username}`);
          this.stopBot(botData.id).catch(() => {});
        } else if (errorMessage.includes("409: Conflict")) {
          logger.warn(
            `🛑 Conflict detected for bot @${botData.username}. Another instance might be running. Stopping auto-poll to prevent interference.`,
          );
          socketService.terminalLog(
            `Auto-poll stopped for @${botData.username} due to conflict with another instance.`,
            "warning",
          );
          this.stopBot(botData.id).catch(() => {});
        }
      });

      // Start polling in background
      bot.start({
        onStart: (botInfo) => {
          logger.info(`✅ Auto-bot @${botInfo.username} is now running!`);
        },
      });

      socketService.terminalLog(
        `Auto Bot @${botData.username} STARTED`,
        "system",
      );

      this.bots.set(botData.id, { bot, username: botData.username });
    } catch (error) {
      logger.error(
        `❌ Failed to start auto-bot @${botData.username}:`,
        error.message,
      );
    }
  }

  /**
   * Stop a specific bot
   */
  async stopBot(botId) {
    try {
      const botInfo = this.bots.get(botId);
      if (botInfo) {
        await botInfo.bot.stop();
        this.bots.delete(botId);
        socketService.terminalLog(
          `Auto Bot @${botInfo.username} STOPPED`,
          "system",
        );
        logger.info(`🛑 Auto-bot stopped: @${botInfo.username}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to stop auto-bot ${botId}:`, error.message);
    }
  }

  /**
   * Restart a bot (useful when settings change)
   */
  async restartBot(botId) {
    await this.stopBot(botId);
    const botData = await prisma.bot.findUnique({ where: { id: botId } });
    if (
      botData &&
      botData.integrationMode === "AUTO" &&
      botData.status === "ACTIVE" &&
      !botData.isPaused
    ) {
      await this.startBot(botData);
    }
  }

  /**
   * Stop all bots (for graceful shutdown)
   */
  async stopAll() {
    logger.info("🛑 Stopping all auto-bots...");
    for (const botId of this.bots.keys()) {
      await this.stopBot(botId);
    }
  }
}

export default new AutoBotManager();
