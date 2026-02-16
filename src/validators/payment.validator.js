import { body } from 'express-validator';

/**
 * Payment Validators
 */

export const paymentValidators = {
  /**
   * Initiate deposit
   */
  initiateDeposit: [
    body('provider')
      .isIn(['CLICK', 'PAYME', 'CRYPTO'])
      .withMessage('Invalid payment provider'),
    
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Amount must be at least 1'),
    
    body('coin')
      .optional()
      .isString()
      .withMessage('Coin must be a string'),
    
    body('network')
      .optional()
      .isIn(['BTC', 'ETH', 'TRC20', 'BEP20', 'ERC20', 'TON'])
      .withMessage('Invalid network'),
    
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
  ],

  /**
   * Request withdrawal
   */
  requestWithdrawal: [
    body('method')
      .isIn(['CARD', 'CRYPTO'])
      .withMessage('Invalid withdrawal method'),
    
    body('provider')
      .isIn(['CLICK', 'PAYME', 'CRYPTO'])
      .withMessage('Invalid payment provider'),
    
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Amount must be at least 1'),
    
    body('coin')
      .optional()
      .isString()
      .withMessage('Coin must be a string'),
    
    body('network')
      .optional()
      .isIn(['BTC', 'ETH', 'TRC20', 'BEP20', 'ERC20', 'TON'])
      .withMessage('Invalid network'),
    
    body('address')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 10, max: 200 })
      .withMessage('Invalid address'),
  ],

  /**
   * Approve withdrawal (admin)
   */
  approveWithdrawal: [
    // No additional validation - param('id') handled in route
  ],

  /**
   * Reject withdrawal (admin)
   */
  rejectWithdrawal: [
    body('reason')
      .isString()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Reason must be between 10 and 500 characters'),
  ],
};

export default paymentValidators;