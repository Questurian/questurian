export type StaffRole = 'admin' | 'editor' | 'writer'

/**
 * Account lifecycle (ADR-0007). A `disabled` member is inactive, not absent:
 * they still hold a row, an author slug and their bylines, but cannot sign in.
 */
export type StaffStatus = 'active' | 'disabled'

/** The roles an admin may move an existing account between, in either direction. */
export type AssignableStaffRole = Extract<StaffRole, 'editor' | 'writer'>

export type AvatarAsset = {
  id: number
  url?: string | null
  filename?: string | null
  alt_text?: string | null
}

export type ExpertiseEntry = {
  id?: string | null
  area: string
}

export type SocialLinks = {
  instagram?: string | null
  twitter?: string | null
  facebook?: string | null
  linkedin?: string | null
  reddit?: string | null
  youtube?: string | null
  patreon?: string | null
  website?: string | null
}

export type PublicProfile = {
  avatar?: AvatarAsset | number | null
  displayName?: string | null
  bio?: string | null
  expertise?: ExpertiseEntry[] | null
  socialLinks?: SocialLinks | null
}

export type StaffUser = {
  id: number
  email: string
  role: StaffRole
  /** Absent on rows read back from a server predating the status column. */
  status?: StaffStatus | null
  firstName?: string | null
  lastName?: string | null
  slug?: string | null
  createdAt?: string
  updatedAt?: string
  publicProfile?: PublicProfile | null
}

export type EmailLogStatus = 'sent' | 'failed'

/** Row from the server's email-logs collection (admin-only delivery log). */
export type EmailLog = {
  id: number
  emailType: string
  recipient: string
  subject?: string | null
  status: EmailLogStatus
  error?: string | null
  createdAt: string
}

export type StaffUserPatch = {
  firstName?: string
  lastName?: string
  /** Admin-only: Payload field access rejects slug changes from non-admins. */
  slug?: string
  publicProfile?: {
    avatar?: number | null
    displayName?: string
    bio?: string
    expertise?: { area: string }[]
    socialLinks?: SocialLinks
  }
}
