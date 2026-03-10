import QueryErrorCard from '../components/QueryErrorCard';
import SubredditForm from '../features/subreddits/components/SubredditForm';
import SubredditsHeader from '../features/subreddits/components/SubredditsHeader';
import SubredditsTable from '../features/subreddits/components/SubredditsTable';
import { useSubredditEditor } from '../features/subreddits/hooks/useSubredditEditor';
import { useSubredditsPageActions } from '../features/subreddits/hooks/useSubredditsPageActions';
import { useSubredditsPageData } from '../features/subreddits/hooks/useSubredditsPageData';

export default function Subreddits() {
  const editor = useSubredditEditor();
  const data = useSubredditsPageData();
  const actions = useSubredditsPageActions({
    editingId: editor.editingId,
    formData: editor.formData,
    onCancel: editor.handleCancel,
  });

  if (data.isLoading) return <div className="loading">Loading subreddits...</div>;

  return (
    <div className="page">
      <SubredditsHeader
        isMutating={actions.isMutating}
        isRefreshing={data.isRefreshing}
        onToggleForm={editor.toggleForm}
        showForm={editor.showForm}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      {editor.showForm && (
        <SubredditForm
          categories={data.categories}
          editingId={editor.editingId}
          formData={editor.formData}
          isMutating={actions.isMutating}
          onCancel={editor.handleCancel}
          onChange={editor.handleFormChange}
          onSubmit={actions.handleSubmit}
        />
      )}

      <SubredditsTable
        categoryNames={data.categoryNames}
        isMutating={actions.isMutating}
        onDelete={actions.handleDelete}
        onEdit={editor.handleEdit}
        subreddits={data.subreddits}
      />
    </div>
  );
}
