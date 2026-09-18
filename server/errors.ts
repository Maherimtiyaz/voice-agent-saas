/**
 * Base class for errors that are safe to translate into a user-facing
 * message. Anything NOT an AppError thrown out of a service should be
 * treated as a bug and shown as a generic "something went wrong" —
 * never forward raw error messages (e.g. driver/DB errors) to the client.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Credentials didn't match an existing account. */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super("Invalid email or password.");
  }
}

/** Attempted to register an email that's already in use. */
export class EmailTakenError extends AppError {
  constructor() {
    super("An account with that email already exists.");
  }
}

/** The acting user isn't a member of the organization at all. */
export class NotAMemberError extends AppError {
  constructor() {
    super("You don't have access to this organization.");
  }
}

/** The acting user is a member, but their role doesn't permit the action. */
export class InsufficientRoleError extends AppError {
  constructor() {
    super("You don't have permission to perform this action.");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found.`);
  }
}

/** A uniqueness constraint was violated (duplicate SID, number, event id, etc). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message);
  }
}
