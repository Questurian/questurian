import QueryErrorCard from '../components/QueryErrorCard';
import YouTubeFeedForm from '../features/youtube/feeds/components/YouTubeFeedForm';
import YouTubeFeedsHeader from '../features/youtube/feeds/components/YouTubeFeedsHeader';
import YouTubeFeedsTable from '../features/youtube/feeds/components/YouTubeFeedsTable';
import { useYouTubeChannelLookup } from '../features/youtube/feeds/hooks/useYouTubeChannelLookup';
import { useYouTubeFeedEditor } from '../features/youtube/feeds/hooks/useYouTubeFeedEditor';
import { useYouTubeFeedsPageActions } from '../features/youtube/feeds/hooks/useYouTubeFeedsPageActions';
import { useYouTubeFeedsPageData } from '../features/youtube/feeds/hooks/useYouTubeFeedsPageData';

export default function YouTubeFeeds() {
  const editor = useYouTubeFeedEditor();
  const lookup = useYouTubeChannelLookup({
    onPopulate: editor.applyChannelLookup,
  });
  const data = useYouTubeFeedsPageData();

  function handleCancel() {
    editor.handleCancel();
    lookup.resetLookup();
  }

  function handleToggleForm() {
    if (editor.showForm) {
      handleCancel();
      return;
    }

    editor.toggleForm();
  }

  const actions = useYouTubeFeedsPageActions({
    editingId: editor.editingId,
    formData: editor.formData,
    onCancel: handleCancel,
  });
  const isMutating = actions.isMutating || lookup.isPending;

  if (data.isLoading) {
    return <div className="loading">Loading YouTube feeds...</div>;
  }

  return (
    <div className="page">
      <YouTubeFeedsHeader
        fetchAllPending={actions.fetchAllPending}
        isMutating={isMutating}
        isRefreshing={data.isRefreshing}
        maxResults={actions.maxResults}
        onFetchAll={actions.handleFetchAll}
        onMaxResultsChange={actions.setMaxResults}
        onToggleForm={handleToggleForm}
        showForm={editor.showForm}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      {editor.showForm && (
        <YouTubeFeedForm
          categories={data.categories}
          countries={data.countries}
          editingId={editor.editingId}
          formData={editor.formData}
          isMutating={isMutating}
          lookup={lookup}
          onCancel={handleCancel}
          onChange={editor.handleFormChange}
          onSubmit={actions.handleSubmit}
        />
      )}

      <YouTubeFeedsTable
        categoryNames={data.categoryNames}
        feeds={data.feeds}
        isMutating={isMutating}
        onDelete={actions.handleDelete}
        onEdit={editor.handleEdit}
        onFetch={actions.handleFetch}
      />
    </div>
  );
}
