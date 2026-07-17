import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth'
import { avatarUrl, fetchStaffUser, updateStaffUser, uploadAvatarAsset } from '../api/staff.api'
import type { SocialLinks, StaffUser } from '../types'

type ProfileFormState = {
  firstName: string
  lastName: string
  displayName: string
  bio: string
  expertise: string[]
  socialLinks: Required<{ [K in keyof SocialLinks]: string }>
}

function formStateFromUser(user: StaffUser): ProfileFormState {
  return {
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    displayName: user.publicProfile?.displayName ?? '',
    bio: user.publicProfile?.bio ?? '',
    expertise: (user.publicProfile?.expertise ?? []).map((entry) => entry.area),
    socialLinks: {
      instagram: user.publicProfile?.socialLinks?.instagram ?? '',
      twitter: user.publicProfile?.socialLinks?.twitter ?? '',
      website: user.publicProfile?.socialLinks?.website ?? '',
    },
  }
}

export default function MyProfilePage() {
  const { user: authUser, token } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [form, setForm] = useState<ProfileFormState | null>(null)
  const [newExpertise, setNewExpertise] = useState('')
  const [pendingAvatarId, setPendingAvatarId] = useState<number | null>(null)
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const userId = authUser?.id
  const profileQuery = useQuery({
    queryKey: ['staff', 'me', userId],
    queryFn: () => fetchStaffUser(userId as string, token as string),
    enabled: Boolean(userId && token),
  })

  useEffect(() => {
    if (profileQuery.data && form === null) {
      setForm(formStateFromUser(profileQuery.data))
    }
  }, [profileQuery.data, form])

  const avatarUpload = useMutation({
    mutationFn: (file: File) => uploadAvatarAsset(file, token as string),
    onSuccess: (asset) => {
      setPendingAvatarId(asset.id)
      setPendingAvatarPreview(avatarUrl(asset))
      setErrorMessage(null)
    },
    onError: (error: Error) => setErrorMessage(error.message),
  })

  const saveProfile = useMutation({
    mutationFn: (state: ProfileFormState) =>
      updateStaffUser(
        userId as string,
        {
          firstName: state.firstName.trim(),
          lastName: state.lastName.trim(),
          publicProfile: {
            ...(pendingAvatarId !== null ? { avatar: pendingAvatarId } : {}),
            displayName: state.displayName.trim(),
            bio: state.bio.trim(),
            expertise: state.expertise
              .map((area) => area.trim())
              .filter(Boolean)
              .map((area) => ({ area })),
            socialLinks: {
              instagram: state.socialLinks.instagram.trim() || null,
              twitter: state.socialLinks.twitter.trim() || null,
              website: state.socialLinks.website.trim() || null,
            },
          },
        },
        token as string,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(['staff', 'me', userId], updated)
      setForm(formStateFromUser(updated))
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

  if (!userId || !token) return null

  if (profileQuery.isLoading || form === null) {
    return (
      <div className="staff-page">
        <p className="staff-muted">Loading your profile…</p>
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="staff-page">
        <p className="staff-error">Could not load your profile: {(profileQuery.error as Error).message}</p>
      </div>
    )
  }

  const profile = profileQuery.data as StaffUser
  const currentAvatar = pendingAvatarPreview ?? avatarUrl(profile.publicProfile?.avatar)

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
    <div className="staff-page">
      <header className="staff-page-header">
        <h1>My Profile</h1>
        <p className="staff-muted">
          How you appear as an author on the public site. Your author page goes live automatically
          once you have published work.
        </p>
      </header>

      <form
        className="staff-card"
        onSubmit={(event) => {
          event.preventDefault()
          saveProfile.mutate(form)
        }}
      >
        <section className="staff-section">
          <h2>Avatar</h2>
          <div className="staff-avatar-row">
            {currentAvatar ? (
              <img className="staff-avatar" src={currentAvatar} alt="Profile avatar" />
            ) : (
              <div className="staff-avatar staff-avatar-empty" aria-hidden="true">
                {(form.displayName || form.firstName || profile.email).slice(0, 1).toUpperCase()}
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
          <label className="staff-field">
            <span>Display name (byline)</span>
            <input
              type="text"
              value={form.displayName}
              placeholder={`${form.firstName} ${form.lastName}`.trim() || 'Shown to readers'}
              onChange={(event) => update('displayName', event.target.value)}
            />
          </label>
          {profile.slug ? (
            <p className="staff-hint">
              Author page: <code>/authors/{profile.slug}</code> — the URL is managed by admins.
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
          <label className="staff-field">
            <span>Instagram URL</span>
            <input
              type="url"
              value={form.socialLinks.instagram}
              placeholder="https://instagram.com/…"
              onChange={(event) =>
                update('socialLinks', { ...form.socialLinks, instagram: event.target.value })
              }
            />
          </label>
          <label className="staff-field">
            <span>Twitter / X URL</span>
            <input
              type="url"
              value={form.socialLinks.twitter}
              placeholder="https://x.com/…"
              onChange={(event) =>
                update('socialLinks', { ...form.socialLinks, twitter: event.target.value })
              }
            />
          </label>
          <label className="staff-field">
            <span>Website URL</span>
            <input
              type="url"
              value={form.socialLinks.website}
              placeholder="https://…"
              onChange={(event) =>
                update('socialLinks', { ...form.socialLinks, website: event.target.value })
              }
            />
          </label>
        </section>

        <footer className="staff-form-footer">
          {statusMessage ? <span className="staff-success">{statusMessage}</span> : null}
          {errorMessage ? <span className="staff-error">{errorMessage}</span> : null}
          <button type="submit" className="staff-button-primary" disabled={saveProfile.isPending}>
            {saveProfile.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </footer>
      </form>
    </div>
  )
}
