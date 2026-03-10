import QueryErrorCard from '../components/QueryErrorCard';
import InstagramFeedForm from '../features/instagram/feeds/components/InstagramFeedForm';
import InstagramFeedsHeader from '../features/instagram/feeds/components/InstagramFeedsHeader';
import InstagramFeedsTable from '../features/instagram/feeds/components/InstagramFeedsTable';
import { useInstagramFeedEditor } from '../features/instagram/feeds/hooks/useInstagramFeedEditor';
import { useInstagramFeedsPageActions } from '../features/instagram/feeds/hooks/useInstagramFeedsPageActions';
import { useInstagramFeedsPageData } from '../features/instagram/feeds/hooks/useInstagramFeedsPageData';

export default function InstagramFeeds() {
  const editor = useInstagramFeedEditor();
  const data = useInstagramFeedsPageData();
  const actions = useInstagramFeedsPageActions({
    editingId: editor.editingId,
    formData: editor.formData,
    onCancel: editor.handleCancel,
  });

  if (data.isLoading) {
    return <div className="loading">Loading Instagram feeds...</div>;
  }

  return (
    <div className="page">
      <InstagramFeedsHeader
        isMutating={actions.isMutating}
        isRefreshing={data.isRefreshing}
        onFetchAll={actions.handleFetchAll}
        onToggleForm={editor.toggleForm}
        showForm={editor.showForm}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      {editor.showForm && (
        <InstagramFeedForm
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

      <InstagramFeedsTable
        categoryNames={data.categoryNames}
        feeds={data.feeds}
        isMutating={actions.isMutating}
        onDelete={actions.handleDelete}
        onEdit={editor.handleEdit}
        onFetch={actions.handleFetch}
      />
    </div>
  );
}
