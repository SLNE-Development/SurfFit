export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly i18nKey: string;
  readonly params?: Record<string, unknown>;

  constructor(i18nKey: string, params?: Record<string, unknown>) {
    super(i18nKey);
    this.name = new.target.name;
    this.i18nKey = i18nKey;
    this.params = params;
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
}

export class PermissionDeniedError extends DomainError {
  readonly code = "PERMISSION_DENIED";
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
}

export class RateLimitedError extends DomainError {
  readonly code = "RATE_LIMITED";
}

export class DomainRuleViolationError extends DomainError {
  readonly code = "DOMAIN_RULE_VIOLATION";
}
