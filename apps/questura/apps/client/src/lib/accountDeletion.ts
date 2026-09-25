/**
 * How a reader has their account deleted at launch (launch fix plan, decision
 * D2): by email, not a button. Shown on the account page and in the privacy
 * text; the handling steps are docs/procedures/account-deletion.md.
 */
export const ACCOUNT_DELETION_EMAIL = 'hello@questurian.com';
export const ACCOUNT_DELETION_DAYS = 30;
export const ACCOUNT_DELETION_MAILTO = `mailto:${ACCOUNT_DELETION_EMAIL}?subject=${encodeURIComponent('Delete my account')}`;
