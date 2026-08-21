import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  avatarUrl,
  createAuthorForUser,
  fetchAuthorById,
  fetchAuthorForUser,
  fetchStaffUser,
  updateAuthor,
  updateStaffUser,
  uploadAvatarAsset,
} from '../api/staff.api'
import type {
  Author,
  AuthorPatch,
  ProfileCapabilities,
  ProfileSubject,
  SocialLinks,
  StaffUser,
  StaffUserPatch,
} from '../types'

type ProfileFormState = {
  firstName: string
  lastName: string
  displayName: string
  bio: string
  slug: string
  expertise: string[]
  socialLinks: Required<{ [K in keyof SocialLinks]: string }>
}

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram URL', placeholder: 'https://instagram.com/…' },
  { key: 'twitter', label: 'Twitter / X URL', placeholder: 'https://x.com/…' },
  { key: 'facebook', label: 'Facebook URL', placeholder: 'https://facebook.com/…' },
  { key: 'linkedin', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/…' },
  { key: 'reddit', label: 'Reddit URL', placeholder: 'https://reddit.com/user/…' },
  { key: 'youtube', label: 'YouTube URL', placeholder: 'https://youtube.com/…' },
  { key: 'patreon', label: 'Patreon URL', placeholder: 'https://patreon.com/…' },
  { key: 'website', label: 'Website URL', placeholder: 'https://…' },
]

type ProfileEditorProps = {
  /**
   * Who is being edited. A union rather than one id because both ADR-0007
   * null-sides are real states: a hire who has never published has a staff
   * identity and no Author (created on first save), and an orphan byline has
   * an Author and no staff identity. Neither key alone spans the domain.
   */
  subject: ProfileSubject
  /**
   * What the acting operator may do, resolved by the page from usePermissions.
   * Explicit flags rather than a role-ish `variant`, so each one maps to a
   * named server rule and a fourth tier has somewhere obvious to land.
   */
  can: ProfileCapabilities
}

/**
 * The form spans two records: names belong to the staff account, everything
 * else to the Author (ADR-0007). `author` is null for someone who has never
 * published -- a normal state, filled in on first save.
 */
function formStateFromRecords(
  user: { firstName?: string | null; lastName?: string | null } | null,
  author: Author | null,
): ProfileFormState {
  return {
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    displayName: author?.displayName ?? '',
    bio: author?.bio ?? '',
    slug: author?.slug ?? '',
    expertise: (author?.expertise ?? []).map((entry) => entry.area),
    socialLinks: Object.fromEntries(
      SOCIAL_FIELDS.map(({ key }) => [key, author?.socialLinks?.[key] ?? '']),
    ) as ProfileFormState['socialLinks'],
  }
}

export default function ProfileEditor({ subject, can }: ProfileEditorProps) {
  const queryClient = useQueryClient()
  const subjectKey = subject.kind === 'user' ? `user:${subject.userId}` : `author:${subject.authorId}`
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [form, setForm] = useState<ProfileFormState | null>(null)
  const [newExpertise, setNewExpertise] = useState('')
  const [pendingAvatarId, setPendingAvatarId] = useState<number | null>(null)
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const profileQuery = useQuery({
    queryKey: ['staff', 'profile', subjectKey],
    queryFn: async (): Promise<{ user: StaffUser | null; author: Author | null }> => {
      // By-author is the orphan-reachable path, so it must tolerate a null
      // account rather than assume one. `showAccountHeader` gates the only
      // read of the staff row, because an editor cannot read anyone else's.
      if (subject.kind === 'author') {
        const author = await fetchAuthorById(subject.authorId)
        return { user: null, author }
      }

      const [user, author] = await Promise.all([
        fetchStaffUser(subject.userId),
        fetchAuthorForUser(subject.userId),
      ])
      return { user, author }
    },
  })

  useEffect(() => {
    if (profileQuery.data && form === null) {
      setForm(formStateFromRecords(profileQuery.data.user, profileQuery.data.author))
    }
  }, [profileQuery.data, form])

  // Reset the form when navigating between staff members on the same route.
  useEffect(() => {
    setForm(null)
    setPendingAvatarId(null)
    setPendingAvatarPreview(null)
    setStatusMessage(null)
    setErrorMessage(null)
  }, [subjectKey])

  const avatarUpload = useMutation({
    mutationFn: (file: File) => uploadAvatarAsset(file),
    onSuccess: (asset) => {
      setPendingAvatarId(asset.id)
      setPendingAvatarPreview(avatarUrl(asset))
      setErrorMessage(null)
    },
    onError: (error: Error) => setErrorMessage(error.message),
  })

  const saveProfile = useMutation({
    mutationFn: async (state: ProfileFormState) => {
      const userPatch: StaffUserPatch = {
        firstName: state.firstName.trim(),
        lastName: state.lastName.trim(),
      }

      const authorPatch: AuthorPatch = {
        ...(pendingAvatarId !== null ? { avatar: pendingAvatarId } : {}),
        displayName: state.displayName.trim(),
        bio: state.bio.trim(),
        expertise: state.expertise
          .map((area) => area.trim())
          .filter(Boolean)
          .map((area) => ({ area })),
        socialLinks: Object.fromEntries(
          SOCIAL_FIELDS.map(({ key }) => [key, state.socialLinks[key].trim() || null]),
        ) as SocialLinks,
      }

      // Slug renames are admin-only (Payload field access enforces this too).
      // An unchanged or cleared slug is omitted so the field is never blanked.
      const existingAuthor = profileQuery.data?.author ?? null
      const nextSlug = state.slug.trim()
      if (can.editSlug && nextSlug && nextSlug !== (existingAuthor?.slug ?? '')) {
        authorPatch.slug = nextSlug
      }

      // Names and authorship are two records now, so this can be two writes.
      // The account goes first: it is the one that must not be lost if the
      // second fails, and an author record can always be re-saved. An editor
      // acting on someone else has no account write at all -- Users stays
      // admin-only (ADR-0011) -- and an orphan byline has no account to write.
      const user =
        can.editAccountNames && subject.kind === 'user'
          ? await updateStaffUser(subject.userId, userPatch)
          : (profileQuery.data?.user ?? null)

      const author = existingAuthor
        ? await updateAuthor(existingAuthor.id, authorPatch)
        : subject.kind === 'user'
          ? await createAuthorForUser(subject.userId, authorPatch)
          : // Unreachable: a by-author subject was resolved from an existing
            // Author, so `existingAuthor` is always set on this path.
            (() => {
              throw new Error('Cannot create an author record without a staff account to link.')
            })()

      return { user, author }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['staff', 'profile', subjectKey], updated)
      void queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['authors', 'directory'] })
      setForm(formStateFromRecords(updated.user, updated.author))
      setPendingAvatarId(null)
      setPendingAvatarPreview(null)
      setStatusMessage('Profile saved.')
      setErrorMessage(null)
    },
    onError: (error: Error) => {
      setStatusMessage(null)
      setErrorMessage(error.message)
    },
  })

  if (profileQuery.isLoading || form === null || !profileQuery.data) {
    if (profileQuery.isError) {
      return (
        <p className="staff-error">
          Could not load the profile: {(profileQuery.error as Error).message}
        </p>
      )
    }
    return <p className="staff-muted">Loading profile…</p>
  }

  const profile = profileQuery.data.user
  const author = profileQuery.data.author
  const currentAvatar = pendingAvatarPreview ?? avatarUrl(author?.avatar)

  function update<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setStatusMessage(null)
  }

  function addExpertise() {
    const area = newExpertise.trim()
    if (!area || !form) return
    if (form.expertise.some((existing) => existing.toLowerCase() === area.toLowerCase())) {
      setNewExpertise('')
      return
    }
    update('expertise', [...form.expertise, area])
    setNewExpertise('')
  }

  return (
    <form
      className="staff-card"
      onSubmit={(event) => {
        event.preventDefault()
        saveProfile.mutate(form)
      }}
    >
      {can.showAccountHeader && profile ? (
        <section className="staff-section">
          <h2>Account</h2>
          <p className="staff-muted">
            {profile.email} · <span className={`staff-role staff-role--${profile.role}`}>{profile.role}</span>
          </p>
        </section>
      ) : null}

      {subject.kind === 'author' && !author?.user ? (
        <section className="staff-section">
          <h2>Unlinked byline</h2>
          <p className="staff-muted">
            This author has no staff account — the person has left, or never had one. Their byline and
            author page keep working, and edits here still reach the public site.
          </p>
        </section>
      ) : null}

      <section className="staff-section">
        <h2>Avatar</h2>
        <div className="staff-avatar-row">
          {currentAvatar ? (
            <img className="staff-avatar" src={currentAvatar} alt="Profile avatar" />
          ) : (
            <div className="staff-avatar staff-avatar-empty" aria-hidden="true">
              {(form.displayName || form.firstName || profile?.email || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="staff-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) avatarUpload.mutate(file)
              }}
            />
            <button
              type="button"
              className="staff-button-secondary"
              disabled={avatarUpload.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUpload.isPending ? 'Uploading…' : 'Upload new avatar'}
            </button>
            {pendingAvatarId !== null ? (
              <p className="staff-hint">New avatar is applied when you save.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="staff-section">
        <h2>Name</h2>
        {/*
          First/last name live on the staff account, not the Author. They are
          shown only when the acting operator can actually write that record --
          an editor editing a writer cannot, and an orphan byline has no
          account to write. The byline below is the Author field and is always
          editable, which is the one that reaches readers.
        */}
        {can.editAccountNames ? (
          <div className="staff-field-row">
            <label className="staff-field">
              <span>First name</span>
              <input
                type="text"
                value={form.firstName}
                onChange={(event) => update('firstName', event.target.value)}
              />
            </label>
            <label className="staff-field">
              <span>Last name</span>
              <input
                type="text"
                value={form.lastName}
                onChange={(event) => update('lastName', event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <label className="staff-field">
          <span>Display name (byline)</span>
          <input
            type="text"
            value={form.displayName}
            placeholder={`${form.firstName} ${form.lastName}`.trim() || 'Shown to readers'}
            onChange={(event) => update('displayName', event.target.value)}
          />
        </label>
        {can.editSlug ? (
          <>
            <label className="staff-field">
              <span>Author URL slug</span>
              <input
                type="text"
                value={form.slug}
                placeholder="Generated from the display name on first save"
                onChange={(event) => update('slug', event.target.value)}
              />
            </label>
            <p className="staff-hint">
              Author page: <code>/authors/{form.slug.trim() || '…'}</code> — renaming a slug breaks
              inbound author URLs; there are no redirects.
            </p>
          </>
        ) : author?.slug ? (
          <p className="staff-hint">
            Author page: <code>/authors/{author.slug}</code> — the URL is managed by admins.
          </p>
        ) : (
          <p className="staff-hint">Your author URL is generated the first time your profile is saved.</p>
        )}
      </section>

      <section className="staff-section">
        <h2>Bio</h2>
        <label className="staff-field">
          <span>Travel expert biography</span>
          <textarea
            rows={5}
            value={form.bio}
            onChange={(event) => update('bio', event.target.value)}
          />
        </label>
      </section>

      <section className="staff-section">
        <h2>Expertise</h2>
        <div className="staff-chip-row">
          {form.expertise.map((area) => (
            <span key={area} className="staff-chip">
              {area}
              <button
                type="button"
                aria-label={`Remove ${area}`}
                onClick={() =>
                  update(
                    'expertise',
                    form.expertise.filter((existing) => existing !== area),
                  )
                }
              >
                ×
              </button>
            </span>
          ))}
          {form.expertise.length === 0 ? (
            <span className="staff-muted">No areas yet — e.g. “Southeast Asia”, “Budget Travel”.</span>
          ) : null}
        </div>
        <div className="staff-field-row staff-add-row">
          <input
            type="text"
            value={newExpertise}
            placeholder="Add an area of expertise"
            onChange={(event) => setNewExpertise(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addExpertise()
              }
            }}
          />
          <button type="button" className="staff-button-secondary" onClick={addExpertise}>
            Add
          </button>
        </div>
      </section>

      <section className="staff-section">
        <h2>Social links</h2>
        {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
          <label key={key} className="staff-field">
            <span>{label}</span>
            <input
              type="url"
              value={form.socialLinks[key]}
              placeholder={placeholder}
              onChange={(event) =>
                update('socialLinks', { ...form.socialLinks, [key]: event.target.value })
              }
            />
          </label>
        ))}
      </section>

      <footer className="staff-form-footer">
        {statusMessage ? <span className="staff-success">{statusMessage}</span> : null}
        {errorMessage ? <span className="staff-error">{errorMessage}</span> : null}
        <button type="submit" className="staff-button-primary" disabled={saveProfile.isPending}>
          {saveProfile.isPending ? 'Saving…' : 'Save profile'}
        </button>
      </footer>
    </form>
  )
}
