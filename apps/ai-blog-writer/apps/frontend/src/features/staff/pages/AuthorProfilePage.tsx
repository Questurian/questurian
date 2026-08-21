import { Link, useParams } from 'react-router-dom'
import { usePermissions } from '../../auth'
import ProfileEditor from '../components/ProfileEditor'

/**
 * A delegated Author edit, addressed by Author id (ADR-0011).
 *
 * Author-keyed rather than account-keyed because this is the only route that
 * can reach an orphan byline -- an Author whose `user` is null has no staff id
 * to be addressed by, and that record is exactly the one most likely to need a
 * correction with nobody left to make it.
 */
export default function AuthorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { canEditOtherAuthors, canManageUsers, isLoading: permissionsLoading } = usePermissions()

  if (permissionsLoading) {
    return (
      <div className="staff-page">
        <p className="staff-muted">Checking your access…</p>
      </div>
    )
  }

  if (!canEditOtherAuthors) {
    return (
      <div className="staff-page">
        <header className="staff-page-header">
          <h1>Author</h1>
        </header>
        <p className="staff-muted">
          Editing other people's author pages is available to editors and admins. To change how you
          appear, head to <Link to="/profile">My Profile</Link>.
        </p>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="staff-page">
        <p className="staff-error">No author selected.</p>
      </div>
    )
  }

  return (
    <div className="staff-page">
      <header className="staff-page-header">
        <p>
          <Link className="staff-back-link" to="/authors">
            ← Back to Authors
          </Link>
        </p>
        <h1>Author</h1>
        <p className="staff-muted">
          Public author presence — photo, byline, bio, expertise and social links. Account details
          (email, role, status) are not editable here.
        </p>
      </header>
      <ProfileEditor
        subject={{ kind: 'author', authorId: id }}
        can={{
          // Never on this route: the account row is not reachable by Author id,
          // and an editor cannot write another staff identity at all.
          editAccountNames: false,
          // Renaming a slug breaks inbound author URLs, so it stays admin-only
          // (Authors.slug is isAdminFieldLevel; this only mirrors it).
          editSlug: canManageUsers,
          // Requires reading the subject's Users row, which an editor cannot.
          showAccountHeader: false,
        }}
      />
    </div>
  )
}
