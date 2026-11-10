/**
 * Store Verification (توثيق المتجر) shared constants.
 *
 * Two paths to the official verified badge:
 *  - FREE: the store reaches FREE_VERIFICATION_FOLLOWER_TARGET followers and
 *    claims verification; an admin still approves the request.
 *  - PAID: the merchant transfers PAID_VERIFICATION_PRICE_EGP via Vodafone
 *    Cash to the platform number, submits proof, and an admin verifies.
 * Either way an admin approves the request directly — approval verifies the
 * store instantly and grants the 10k-follower milestone boost.
 */

export const FREE_VERIFICATION_FOLLOWER_TARGET = 10_000;
export const PAID_VERIFICATION_PRICE_EGP = 700;

export const VERIFICATION_TYPES = ["free", "paid"] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export const VERIFICATION_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type VerificationRequestStatus =
  (typeof VERIFICATION_REQUEST_STATUSES)[number];

/** Vodafone Cash number merchants transfer the paid fee to (platform billing). */
export const VERIFICATION_PAYMENT_NUMBER = "01065592701";
export const VERIFICATION_PAYMENT_METHOD = "Vodafone Cash";
