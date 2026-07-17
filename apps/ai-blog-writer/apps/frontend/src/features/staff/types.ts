export type StaffRole = 'admin' | 'editor' | 'writer'

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
  firstName?: string | null
  lastName?: string | null
  slug?: string | null
  createdAt?: string
  updatedAt?: string
  publicProfile?: PublicProfile | null
}

export type StaffUserPatch = {
  firstName?: string
  lastName?: string
  publicProfile?: {
    avatar?: number | null
    displayName?: string
    bio?: string
    expertise?: { area: string }[]
    socialLinks?: SocialLinks
  }
}
