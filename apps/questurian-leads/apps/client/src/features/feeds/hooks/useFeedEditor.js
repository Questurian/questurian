import { useState } from 'react';
import { EMPTY_FEED_FORM } from '../constants/feeds.constants';
import { buildFeedFormData } from '../utils/feedPresentation';

export function useFeedEditor() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FEED_FORM });

  function handleFormChange(key, value) {
    setFormData((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function handleEdit(feed) {
    setEditingId(feed.id);
    setFormData(buildFeedFormData(feed));
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...EMPTY_FEED_FORM });
  }

  function toggleForm() {
    if (showForm) {
      handleCancel();
      return;
    }

    setEditingId(null);
    setFormData({ ...EMPTY_FEED_FORM });
    setShowForm(true);
  }

  return {
    editingId,
    formData,
    handleCancel,
    handleEdit,
    handleFormChange,
    setShowForm,
    showForm,
    toggleForm,
  };
}
