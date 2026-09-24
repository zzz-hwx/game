export interface QoderUser {
  readonly user_id: string;
  readonly name: string;
  readonly picture: string;
  readonly site_id: string;
  readonly host_id: string;
  readonly session_expires_at: number;
  readonly org_id?: string;
}
export class UserContextError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number);
}
export function getUser(request: Request): Readonly<QoderUser> | null;
export function requireUser(request: Request): Readonly<QoderUser>;
