import { Server } from "socket.io";
import logger from "../../utils/logger.js";
import jwtUtil from "../../utils/jwt.js";

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
        origin: (origin, callback) => {
          // If no origin (same-origin, tools, etc.) or in allowed list
          const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",");
          if (
            !origin ||
            allowedOrigins.includes(origin) ||
            origin.includes("akhmads.net")
          ) {
            callback(null, true);
          } else {
            logger.warn(`Socket.io CORS blocked origin: ${origin}`);
            callback(null, false); // Block it but don't throw hard
          }
        },
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
      if (token === "null" || token === "undefined") token = null;

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
        let decoded;
        try {
          decoded = jwtUtil.verify(token);
        } catch (err) {
          // If the provided token is expired, but we have cookies, try the cookie!
          if (
            err.message === "Token expired" &&
            socket.handshake.headers.cookie
          ) {
            const cookies = socket.handshake.headers.cookie
              .split(";")
              .reduce((acc, cookie) => {
                const [name, value] = cookie.trim().split("=");
                acc[name] = value;
                return acc;
              }, {});

            if (cookies.accessToken && cookies.accessToken !== token) {
              decoded = jwtUtil.verify(cookies.accessToken);
              token = cookies.accessToken; // Success fallback
            } else {
              throw err; // No better token in cookies
            }
          } else {
            throw err;
          }
        }

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
        return next(new Error(`Authentication error: ${err.message}`));
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
