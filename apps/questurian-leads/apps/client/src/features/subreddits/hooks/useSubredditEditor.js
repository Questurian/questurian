import { useState } from 'react';
import { EMPTY_SUBREDDIT_FORM } from '../constants/subreddits.constants';
import { buildSubredditFormData } from '../utils/subredditPresentation';

export function useSubredditEditor() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_SUBREDDIT_FORM });

  function handleFormChange(key, value) {
    setFormData((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function handleEdit(subreddit) {
    setEditingId(subreddit.id);
    setFormData(buildSubredditFormData(subreddit));
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...EMPTY_SUBREDDIT_FORM });
  }

  function toggleForm() {
    if (showForm) {
      handleCancel();
      return;
    }

    setEditingId(null);
    setFormData({ ...EMPTY_SUBREDDIT_FORM });
    setShowForm(true);
  }

  return {
    editingId,
    formData,
    handleCancel,
    handleEdit,
    handleFormChange,
    showForm,
    toggleForm,
  };
}
