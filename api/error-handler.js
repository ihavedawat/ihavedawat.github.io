// Standardized error handling for API endpoints
// Maps error messages to appropriate HTTP status codes and user-friendly responses

export function handleApiError(error, defaultMessage = 'An error occurred') {
  // Known error codes with standard responses
  const errorMap = {
    'INSUFFICIENT_FUNDS': { status: 402, message: 'Insufficient wallet balance' },
    'Order not found': { status: 404, message: 'Order not found' },
    'Order does not belong to this user': { status: 403, message: 'Unauthorized' },
    'Order already cancelled': { status: 400, message: 'Order already cancelled' },
    'TOPUP_NOT_FOUND': { status: 404, message: 'Top-up request not found' },
    'Invalid topup amount': { status: 400, message: 'Invalid top-up amount' },
    'Order status is not placed': { status: 400, message: 'Cannot modify this order' },
    'Not authorized': { status: 403, message: 'Unauthorized' },
    'Invalid token': { status: 401, message: 'Unauthorized' },
    'Missing authorization token': { status: 401, message: 'Unauthorized' },
  };

  // Check for exact match first
  if (errorMap[error.message]) {
    const { status, message } = errorMap[error.message];
    return { status, message };
  }

  // Check for partial matches
  for (const [key, { status, message }] of Object.entries(errorMap)) {
    if (error.message?.includes(key)) {
      return { status, message };
    }
  }

  // Default: 500 server error without exposing details
  return { status: 500, message: defaultMessage };
}

export function sendErrorResponse(res, error, defaultMessage = 'An error occurred') {
  const { status, message } = handleApiError(error, defaultMessage);
  return res.status(status).json({ error: message });
}
