import { APPROVAL_FILTERS } from '../constants/approval.constants';

export default function ApprovalFilterTabs({
  filter,
  onChange,
  tabCounts,
}) {
  return (
    <div className="filters card">
      <div className="filter-tabs">
        <button
          className={filter === APPROVAL_FILTERS.all ? 'active' : ''}
          onClick={() => onChange(APPROVAL_FILTERS.all)}
        >
          All ({tabCounts.all})
        </button>
        <button
          className={filter === APPROVAL_FILTERS.articles ? 'active' : ''}
          onClick={() => onChange(APPROVAL_FILTERS.articles)}
        >
          Articles ({tabCounts.articles})
        </button>
        <button
          className={filter === APPROVAL_FILTERS.instagram ? 'active' : ''}
          onClick={() => onChange(APPROVAL_FILTERS.instagram)}
        >
          Instagram ({tabCounts.instagram})
        </button>
      </div>
    </div>
  );
}
