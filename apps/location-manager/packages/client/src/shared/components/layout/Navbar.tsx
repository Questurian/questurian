import { Link } from "react-router-dom";
import { usePendingTaxonomy } from "@client/shared/services/api/hooks";
import "./Navbar.css";

export function Navbar() {
  const { data: pendingEntries } = usePendingTaxonomy();
  const pendingCount = pendingEntries?.length || 0;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          Location Manager
        </Link>
        <ul className="navbar-menu">
          <li>
            <Link to="/add">Add Location</Link>
          </li>
          <li>
            <Link to="/admin/taxonomy" className="flex items-center gap-2">
              Admin Taxonomy
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                  {pendingCount}
                </span>
              )}
            </Link>
          </li>
          <li>
            <Link to="/admin/payload-sync">Payload Sync</Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
