import { useAuth } from '../../auth'
import ProfileEditor from '../components/ProfileEditor'

export default function MyProfilePage() {
  const { user: authUser } = useAuth()

  if (!authUser?.id) return null

  return (
    <div className="staff-page">
      <header className="staff-page-header">
        <h1>My Profile</h1>
        <p className="staff-muted">
          How you appear as an author on the public site. Your author page goes live automatically
          once you have published work.
        </p>
      </header>
      <ProfileEditor
        subject={{ kind: 'user', userId: authUser.id }}
        can={{
          // Your own account row is yours to update at every role; the slug is
          // admin-only even here, because renaming it breaks inbound author URLs.
          editAccountNames: true,
          editSlug: false,
          // Your own email and role are on the page you came from; repeating
          // them above your own form adds nothing.
          showAccountHeader: false,
        }}
      />
    </div>
  )
}
