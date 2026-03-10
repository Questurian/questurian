import { useState } from 'react';
import { EMPTY_INSTAGRAM_FEED_FORM } from '../constants/instagramFeeds.constants';
import { buildInstagramFeedFormData } from '../utils/instagramFeedPresentation';

export function useInstagramFeedEditor() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_INSTAGRAM_FEED_FORM });

  function handleFormChange(key, value) {
    setFormData((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function handleEdit(feed) {
    setEditingId(feed.id);
    setFormData(buildInstagramFeedFormData(feed));
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...EMPTY_INSTAGRAM_FEED_FORM });
  }

  function toggleForm() {
    if (showForm) {
      handleCancel();
      return;
    }

    setEditingId(null);
    setFormData({ ...EMPTY_INSTAGRAM_FEED_FORM });
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
