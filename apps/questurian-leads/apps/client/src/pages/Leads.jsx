import QueryErrorCard from '../components/QueryErrorCard';
import LeadsBulkActions from '../features/leads/components/LeadsBulkActions';
import LeadsFilters from '../features/leads/components/LeadsFilters';
import LeadsHeader from '../features/leads/components/LeadsHeader';
import LeadsResults from '../features/leads/components/LeadsResults';
import { useLeadsPageActions } from '../features/leads/hooks/useLeadsPageActions';
import { useLeadsPageData } from '../features/leads/hooks/useLeadsPageData';
import { useLeadsPageFilters } from '../features/leads/hooks/useLeadsPageFilters';

export default function Leads() {
  const filters = useLeadsPageFilters();
  const data = useLeadsPageData(filters.values);
  const actions = useLeadsPageActions({ filters: filters.values });

  return (
    <div className="page">
      <LeadsHeader
        isRefreshing={data.isRefreshing}
        leadCount={data.leads.length}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      <LeadsFilters
        categories={data.categories}
        feeds={data.feeds}
        filters={filters.values}
        onClear={filters.clearFilters}
        onFilterChange={filters.handleFilterChange}
        tags={data.tags}
      />

      <LeadsBulkActions
        detectPending={actions.detectPending}
        onDetectLanguages={actions.handleDetectLanguages}
        onTranslate={actions.handleTranslate}
        translatePending={actions.translatePending}
      />

      <LeadsResults
        feedNames={data.feedNames}
        isLoading={data.isLoading}
        isMutating={actions.isMutating}
        leads={data.leads}
        onDelete={actions.handleDelete}
        showTranslated={filters.showTranslated}
      />
    </div>
  );
}
