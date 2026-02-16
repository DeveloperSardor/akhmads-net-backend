import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { authenticate } from '../../../src/middleware/auth.js';
import jwtUtil from '../../../src/utils/jwt.js';
import { createTestUser } from '../../helpers.js';

describe('Auth Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      get: jest.fn((header) => mockReq.headers[header]),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('should authenticate valid token', async () => {
    const user = await createTestUser({ role: 'ADVERTISER' });
    const token = jwtUtil.generateAccessToken(user);

    mockReq.headers.authorization = `Bearer ${token}`;

    await authenticate(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.userId).toBe(user.id);
    expect(mockReq.userRole).toBe('ADVERTISER');
  });

  it('should reject missing token', async () => {
    await authenticate(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject invalid token', async () => {
    mockReq.headers.authorization = 'Bearer invalid_token';

    await authenticate(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should reject banned user', async () => {
    const user = await createTestUser({ isBanned: true });
    const token = jwtUtil.generateAccessToken(user);

    mockReq.headers.authorization = `Bearer ${token}`;

    await authenticate(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
  });
});