import QueryErrorCard from '../components/QueryErrorCard';
import FeedEditorCard from '../features/feeds/components/FeedEditorCard';
import FeedFetchStatus from '../features/feeds/components/FeedFetchStatus';
import FeedsHeader from '../features/feeds/components/FeedsHeader';
import FeedsTable from '../features/feeds/components/FeedsTable';
import { useFeedEditor } from '../features/feeds/hooks/useFeedEditor';
import { useFeedsPageActions } from '../features/feeds/hooks/useFeedsPageActions';
import { useFeedsPageData } from '../features/feeds/hooks/useFeedsPageData';

export default function Feeds() {
  const editor = useFeedEditor();
  const data = useFeedsPageData();
  const actions = useFeedsPageActions({
    editingId: editor.editingId,
    feeds: data.feeds,
    formData: editor.formData,
    onCancel: editor.handleCancel,
  });

  if (data.isLoading) {
    return <div className="loading">Loading feeds...</div>;
  }

  return (
    <div className="page">
      <FeedsHeader
        fetchAllPending={actions.fetchAllPending}
        isMutating={actions.isMutating}
        isRefreshing={data.isRefreshing}
        onFetchAll={actions.handleFetchAll}
        onToggleForm={editor.toggleForm}
        showForm={editor.showForm}
      />

      <FeedFetchStatus fetchStatus={actions.fetchStatus} />

      {data.error && <QueryErrorCard error={data.error} />}

      {editor.showForm && (
        <FeedEditorCard
          categories={data.categories}
          countries={data.countries}
          editingId={editor.editingId}
          formData={editor.formData}
          isMutating={actions.isMutating}
          onCancel={editor.handleCancel}
          onChange={editor.handleFormChange}
          onSubmit={actions.handleSubmit}
        />
      )}

      <FeedsTable
        activeFetchId={actions.activeFetchId}
        categoryNames={data.categoryNames}
        feeds={data.feeds}
        isFetchPending={actions.fetchPending}
        isMutating={actions.isMutating}
        onDelete={actions.handleDelete}
        onEdit={editor.handleEdit}
        onFetch={actions.handleFetch}
      />
    </div>
  );
}
