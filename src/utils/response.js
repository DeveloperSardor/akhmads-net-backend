
// src/utils/response.jsa
/**
 * Standard API Response Formatter
 * Ensures consistent response structure across all endpoints
 */
class ResponseFormatter {
  /**
   * Success response
   * @param {object} res - Express response object
   * @param {object} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code
   */
  success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Error response
   * @param {object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {object} errors - Validation errors (optional)
   */
  error(res, message = 'Error', statusCode = 400, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Created response (201)
   */
  created(res, data = null, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * No content response (204)
   */
  noContent(res) {
    return res.status(204).send();
  }

  /**
   * Unauthorized response (401)
   */
  unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401);
  }

  /**
   * Forbidden response (403)
   */
  forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403);
  }

  /**
   * Not found response (404)
   */
  notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * Validation error response (422)
   */
  validationError(res, errors, message = 'Validation failed') {
    return this.error(res, message, 422, errors);
  }

  /**
   * Internal server error (500)
   */
  serverError(res, message = 'Internal server error') {
    return this.error(res, message, 500);
  }

  /**
   * Paginated response
   * @param {object} res - Express response object
   * @param {array} data - Array of items
   * @param {object} pagination - Pagination info
   */
  paginated(res, data, pagination) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

const response = new ResponseFormatter();
export default response;