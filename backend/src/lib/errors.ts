/** Error returned to clients as `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errors = {
  unauthorized: () => new ApiError(401, 'unauthorized', 'Sign in to continue.'),
  forbidden: () => new ApiError(403, 'forbidden', 'You do not have access to this.'),
  notFound: (what = 'Resource') => new ApiError(404, 'not_found', `${what} not found.`),
  invalidCredentials: () => new ApiError(401, 'invalid_credentials', 'The email or password is incorrect.'),
  emailTaken: () => new ApiError(409, 'email_taken', 'An account with this email already exists.'),
  phoneTaken: () => new ApiError(409, 'phone_taken', 'This mobile number is already linked to an account.'),
  phoneNotRegistered: () => new ApiError(404, 'phone_not_registered', 'No account uses this number yet.'),
  invalidCode: () => new ApiError(400, 'invalid_code', 'That code is not right or has expired.'),
  tooManyRequests: (message = 'Please wait a moment before trying again.') => new ApiError(429, 'too_many_requests', message),
  suspended: () => new ApiError(403, 'account_suspended', 'This account is suspended. Contact Sarena support.'),
  membershipRequired: () => new ApiError(402, 'membership_required', 'An active Sarena membership is required to book.'),
  soldOut: () => new ApiError(409, 'sold_out', 'This offer just sold out at the member price.'),
  paymentsDisabled: () => new ApiError(501, 'payments_unavailable', 'Online payment is not configured yet.'),
};
