import { Server } from "socket.io";
import logger from "../../utils/logger.js";
import jwt from "jsonwebtoken";

/**
 * Socket Service
 * Handles real-time communication and Admin Terminal updates
 */
class SocketService {
  constructor() {
    this.io = null;
    this.adminNamespace = null;
  }

  /**
   * Initialize Socket.io with HTTP server
   */
  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.ADMIN_URL || "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Dedicated namespace for Admin panel
    this.adminNamespace = this.io.of("/admin");

    // Authentication middleware for Admin namespace
    this.adminNamespace.use((socket, next) => {
      let token = socket.handshake.auth.token || socket.handshake.query.token;

      // --- NEW: Also check cookies for HttpOnly environments ---
      if (!token && socket.handshake.headers.cookie) {
        const cookies = socket.handshake.headers.cookie
          .split(";")
          .reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split("=");
            acc[name] = value;
            return acc;
          }, {});
        token = cookies.accessToken;
      }

      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Only allow admins
        if (!["ADMIN", "SUPER_ADMIN", "MODERATOR"].includes(decoded.role)) {
          return next(
            new Error("Authentication error: Insufficient permissions"),
          );
        }

        socket.user = decoded;
        next();
      } catch (err) {
        logger.warn(`Invalid socket connection attempt: ${err.message}`);
        return next(new Error("Authentication error: Invalid token"));
      }
    });

    this.adminNamespace.on("connection", (socket) => {
      logger.info(
        `Admin ${socket.user.username || socket.user.id} connected to terminal WebSocket`,
      );

      // Send initial welcome message
      socket.emit("terminal:log", {
        timestamp: new Date().toISOString(),
        message: "Connected to AKHMADS.NET System Terminal",
        type: "system",
      });

      socket.on("disconnect", (reason) => {
        logger.info(`Admin ${socket.user.id} disconnected: ${reason}`);
      });
    });

    logger.info("✅ WebSocket Service initialized");
  }

  /**
   * Send a live log message to the admin terminal
   * @param {string} message - Message text
   * @param {string} type - info, success, warning, error, system, broadcast, ad
   * @param {object} data - Optional metadata
   */
  terminalLog(message, type = "info", data = null) {
    if (!this.adminNamespace) return;

    this.adminNamespace.emit("terminal:log", {
      timestamp: new Date().toISOString(),
      message,
      type,
      data,
    });
  }

  /**
   * Broadcast a general event to admins
   */
  broadcastToAdmins(event, payload) {
    if (!this.adminNamespace) return;
    this.adminNamespace.emit(event, payload);
  }

  /**
   * Send notification to a specific user (if connected)
   * This would need a mapping of userId -> socketId
   */
}

const socketService = new SocketService();
export default socketService;
