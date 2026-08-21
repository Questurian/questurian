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

/**
 * The public authorship record (ADR-0007). Its own collection, linked to a
 * staff account by `user` -- and valid with that link absent, which is what
 * lets a byline outlive the account.
 */
export type Author = {
  id: number
  slug?: string | null
  user?: number | { id: number } | null
  displayName: string
  avatar?: AvatarAsset | number | null
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
  createdAt?: string
  updatedAt?: string
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

/** The account half of the profile form: who the person is, not how they appear. */
export type StaffUserPatch = {
  firstName?: string
  lastName?: string
}

/** The authorship half: how the person appears on the public site. */
export type AuthorPatch = {
  /** Admin-only: Payload field access rejects slug changes from non-admins. */
  slug?: string
  user?: number
  displayName?: string
  avatar?: number | null
  bio?: string
  expertise?: { area: string }[]
  socialLinks?: SocialLinks
}

/**
 * Who a ProfileEditor is editing. Both variants exist because both ADR-0007
 * null-sides are real: `user` reaches a staff identity that may not have an
 * Author yet (the form creates one on first save), `author` reaches an Author
 * that may have no staff identity at all -- an orphan byline.
 */
export type ProfileSubject =
  | { kind: 'user'; userId: number | string }
  | { kind: 'author'; authorId: number | string }

/**
 * What the acting operator may do to this subject. Each flag names one server
 * rule rather than one role, so the UI cannot drift into asserting a privilege
 * Payload does not actually grant.
 */
export type ProfileCapabilities = {
  /** Authors.slug is isAdminFieldLevel: admins only, at every tier. */
  editSlug: boolean
  /** Users.firstName/lastName -- reachable only when the subject has an account. */
  editAccountNames: boolean
  /** Show the email + role header. Requires reading the subject's Users row. */
  showAccountHeader: boolean
}
