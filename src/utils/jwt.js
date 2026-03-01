import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import logger from './logger.js';

/**
 * JWT Token Management
 * Handles access and refresh tokens with rotation
 */
class JWT {
    constructor() {
        this.secret = process.env.JWT_SECRET;
        this.accessExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
        this.refreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    }

    /**
     * Generate access token
     * @param {object} payload - User data
     * @returns {string} - JWT token
     */
    generateAccessToken(payload) {
        const isAdmin = payload.role === 'ADMIN' || (payload.roles && payload.roles.includes('ADMIN'));
        const expiresIn = isAdmin ? '1d' : '2d';

        return jwt.sign(payload, this.secret, {
            expiresIn: expiresIn,
            issuer: 'akhmads.net',
            jwtid: nanoid(),
        });
    }

    /**
     * Generate refresh token
     * @param {object} payload - User data
     * @returns {string} - JWT token
     */
    generateRefreshToken(payload) {
        const isAdmin = payload.role === 'ADMIN' || (payload.roles && payload.roles.includes('ADMIN'));
        const expiresIn = isAdmin ? '1d' : '2d';

        return jwt.sign(payload, this.secret, {
            expiresIn: expiresIn,
            issuer: 'akhmads.net',
            jwtid: nanoid(),
        });
    }

    /**
     * Generate both tokens
     * @param {object} user - User object
     * @returns {object} - { accessToken, refreshToken }
     */
    generateTokenPair(user) {
        const payload = {
            userId: user.id,
            telegramId: user.telegramId,
            role: user.role,
            roles: user.roles || [],
            email: user.email,
        };

        return {
            accessToken: this.generateAccessToken(payload),
            refreshToken: this.generateRefreshToken(payload),
        };
    }

    /**
     * Verify token
     * @param {string} token - JWT token
     * @returns {object} - Decoded payload
     */
    verify(token) {
        try {
            return jwt.verify(token, this.secret, {
                issuer: 'akhmads.net',
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token expired');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }

    /**
     * Decode token without verification (for expired tokens)
     * @param {string} token - JWT token
     * @returns {object} - Decoded payload
     */
    decode(token) {
        return jwt.decode(token);
    }

    /**
     * Generate bot API key (long-lived JWT)
     * @param {object} bot - Bot object
     * @returns {string} - API key
     */
    generateBotApiKey(bot) {
        return jwt.sign(
            {
                botId: bot.id,
                ownerId: bot.ownerId,
                telegramBotId: bot.telegramBotId,
                username: bot.username,
            },
            this.secret,
            {
                expiresIn: '1y', // 1 year
                issuer: 'akhmads.net',
                audience: 'bot-api',
                jwtid: nanoid(),
            },
        );
    }

    /**
     * Verify bot API key
     * @param {string} apiKey - API key
     * @returns {object} - Decoded payload
     */
    verifyBotApiKey(apiKey) {
        try {
            return jwt.verify(apiKey, this.secret, {
                issuer: 'akhmads.net',
                audience: 'bot-api',
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('API key expired');
            }
            throw new Error('Invalid API key');
        }
    }
}

const jwtUtil = new JWT();
export default jwtUtil;