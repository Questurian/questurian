import { LEADS_EMPTY_MESSAGE } from '../constants/leads.constants';
import LeadResultCard from './LeadResultCard';

export default function LeadsResults({
  feedNames,
  isLoading,
  isMutating,
  leads,
  onDelete,
  showTranslated,
}) {
  if (isLoading) {
    return <div className="loading">Loading leads...</div>;
  }

  if (leads.length === 0) {
    return (
      <div className="empty-state">
        <p>{LEADS_EMPTY_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div className="leads-list">
      {leads.map((lead) => (
        <LeadResultCard
          key={lead.id}
          lead={lead}
          feedName={feedNames.get(lead.feed_id)}
          isMutating={isMutating}
          onDelete={onDelete}
          showTranslated={showTranslated}
        />
      ))}
    </div>
  );
}
