/**
 * Shared types/constants for the platform site banner. Safe to import from
 * both server and client code — keep this file free of server-only imports.
 */

export const MAX_BANNER_MESSAGE_LENGTH = 500;
/** Longest allowed lifetime for a banner, in hours (30 days). */
export const MAX_BANNER_DURATION_HOURS = 24 * 30;

export interface PlatformBroadcastDTO {
  id: string;
  message: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}
