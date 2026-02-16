// src/middleware/rbac.js
import { ROLES, ROLE_HIERARCHY } from '../config/constants.js';
import response from '../utils/response.js';
import { AuthorizationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Role-Based Access Control Middleware
 * ✅ UPDATED: Now supports roles array for multi-role users
 */

/**
 * Helper: Check if user has a specific role
 * ✅ Checks both roles array (new) and single role (backward compatible)
 */
function hasRole(user, userRole, targetRole) {
  if (!user) return false;
  
  // Check in roles array (new multi-role system)
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.includes(targetRole);
  }
  
  // Fallback to single role (backward compatibility)
  return userRole === targetRole;
}

/**
 * Require specific role(s)
 * @param {string|array} allowedRoles - Single role or array of roles
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.userRole) {
        throw new AuthorizationError('User not authenticated');
      }

      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      // ✅ Check if user has any of the allowed roles (supports roles array)
      const hasRequiredRole = roles.some(role => hasRole(req.user, req.userRole, role));

      if (!hasRequiredRole) {
        logger.warn(`Access denied for user ${req.userId} with role ${req.userRole}`);
        throw new AuthorizationError('Insufficient permissions');
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return response.forbidden(res, error.message);
      }
      return response.serverError(res, 'Authorization failed');
    }
  };
};

/**
 * Require minimum role level
 * @param {string} minimumRole - Minimum required role
 */
export const requireMinRole = (minimumRole) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.userRole) {
        throw new AuthorizationError('User not authenticated');
      }

      const userLevel = ROLE_HIERARCHY[req.userRole];
      const minimumLevel = ROLE_HIERARCHY[minimumRole];

      if (!userLevel || !minimumLevel) {
        throw new Error('Invalid role specified');
      }

      if (userLevel < minimumLevel) {
        logger.warn(`Access denied for user ${req.userId} with role ${req.userRole}`);
        throw new AuthorizationError('Insufficient permissions');
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return response.forbidden(res, error.message);
      }
      return response.serverError(res, 'Authorization failed');
    }
  };
};

/**
 * Admin only access
 */
export const requireAdmin = requireMinRole(ROLES.ADMIN);

/**
 * Super admin only access
 */
export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

/**
 * Moderator or higher
 */
export const requireModerator = requireMinRole(ROLES.MODERATOR);

/**
 * Check if user owns resource
 * @param {string} resourceField - Field name in req.params or req.body
 * @param {string} ownerField - Field name for owner ID (default: 'userId')
 */
export const requireOwnership = (resourceField = 'id', ownerField = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthorizationError('User not authenticated');
      }

      // Admins can access any resource
      if (ROLE_HIERARCHY[req.userRole] >= ROLE_HIERARCHY[ROLES.ADMIN]) {
        return next();
      }

      const resourceId = req.params[resourceField] || req.body[resourceField];
      const resource = req[resourceField]; // Should be attached by previous middleware

      if (!resource) {
        throw new Error('Resource not found in request');
      }

      const ownerId = resource[ownerField];

      if (!ownerId || ownerId !== req.userId) {
        logger.warn(`Ownership check failed for user ${req.userId}`);
        throw new AuthorizationError('You do not own this resource');
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return response.forbidden(res, error.message);
      }
      return response.serverError(res, 'Authorization failed');
    }
  };
};

/**
 * Check if user is advertiser
 * ✅ UPDATED: Now checks roles array
 */
export const requireAdvertiser = (req, res, next) => {
  if (!req.user) {
    return response.unauthorized(res);
  }

  // ✅ Check if user has ADVERTISER role (supports roles array)
  const isAdvertiser = hasRole(req.user, req.userRole, ROLES.ADVERTISER);
  const isAdmin = ROLE_HIERARCHY[req.userRole] >= ROLE_HIERARCHY[ROLES.ADMIN];

  if (!isAdvertiser && !isAdmin) {
    return response.forbidden(res, 'This action requires advertiser role');
  }

  next();
};

/**
 * Check if user is bot owner
 * ✅ UPDATED: Now checks roles array
 */
export const requireBotOwner = (req, res, next) => {
  if (!req.user) {
    return response.unauthorized(res);
  }

  // ✅ DEBUG: Log qilamiz
  console.log('🔍 DEBUG requireBotOwner:');
  console.log('User ID:', req.userId);
  console.log('User role (single):', req.userRole);
  console.log('User roles (array):', req.user.roles);
  console.log('Full user object:', JSON.stringify(req.user, null, 2));

  const isBotOwner = hasRole(req.user, req.userRole, ROLES.BOT_OWNER);
  const isAdmin = ROLE_HIERARCHY[req.userRole] >= ROLE_HIERARCHY[ROLES.ADMIN];

  console.log('Has BOT_OWNER role?', isBotOwner);
  console.log('Is Admin?', isAdmin);

  if (!isBotOwner && !isAdmin) {
    return response.forbidden(res, 'This action requires bot owner role');
  }

  next();
};
