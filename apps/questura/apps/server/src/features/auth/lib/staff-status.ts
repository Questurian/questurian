/**
 * Staff account lifecycle state (ADR-0007).
 *
 * Deleting a row is no longer how a person leaves: a `disabled` account keeps
 * its row, its slug and every relationship pointing at it, but authenticates
 * nowhere and holds no access.
 */
export type StaffStatus = 'active' | 'disabled'

export const STAFF_STATUSES: readonly StaffStatus[] = ['active', 'disabled']

/**
 * Rows written before the `status` column existed default to `active` in the
 * migration, but `req.user` is also read in tests and scripts that build user
 * objects by hand. Absent status is therefore treated as active — disabling is
 * always an explicit act.
 */
export function isDisabledStaff(user: { status?: string | null } | null | undefined): boolean {
  return user?.status === 'disabled'
}

export function isActiveStaff(user: { status?: string | null } | null | undefined): boolean {
  return Boolean(user) && !isDisabledStaff(user)
}
