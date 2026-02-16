import { describe, it, expect, jest } from '@jest/globals';
import { requireRole, requireMinRole } from '../../../src/middleware/rbac.js';

describe('RBAC Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { userRole: 'ADVERTISER' };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('requireRole', () => {
    it('should allow user with correct role', () => {
      const middleware = requireRole(['ADVERTISER', 'BOT_OWNER']);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject user without correct role', () => {
      const middleware = requireRole(['ADMIN']);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireMinRole', () => {
    it('should allow admin when moderator required', () => {
      mockReq.userRole = 'ADMIN';
      const middleware = requireMinRole('MODERATOR');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject advertiser when moderator required', () => {
      mockReq.userRole = 'ADVERTISER';
      const middleware = requireMinRole('MODERATOR');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});