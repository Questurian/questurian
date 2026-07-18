import { Link, useParams } from 'react-router-dom'
import { usePermissions } from '../../auth'
import ProfileEditor from '../components/ProfileEditor'

/**
 * Admin editor for any Staff identity's author profile. Staff identities are
 * operated on behalf of their authors, so admins need the same editing surface
 * (photos included) that My Profile gives the identity itself, plus the
 * admin-only author slug.
 */
export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { canManageUsers, isLoading: permissionsLoading } = usePermissions()

  if (permissionsLoading) {
    return (
      <div className="staff-page">
        <p className="staff-muted">Checking your access…</p>
      </div>
    )
  }

  if (!canManageUsers) {
    return (
      <div className="staff-page">
        <header className="staff-page-header">
          <h1>Staff profile</h1>
        </header>
        <p className="staff-muted">
          Editing other staff profiles is available to admins only. If you need a change to your own
          author presence, head to My Profile instead.
        </p>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="staff-page">
        <p className="staff-error">No staff member selected.</p>
      </div>
    )
  }

  return (
    <div className="staff-page">
      <header className="staff-page-header">
        <p>
          <Link className="staff-back-link" to="/staff">
            ← Back to Staff
          </Link>
        </p>
        <h1>Staff profile</h1>
        <p className="staff-muted">
          Edit this Staff identity's public author presence — names, bio, expertise, social links,
          avatar, and the author URL slug.
        </p>
      </header>
      <ProfileEditor userId={id} variant="admin" />
    </div>
  )
}
