import { useState } from 'react';
import { EMPTY_YOUTUBE_FEED_FORM } from '../constants/youtubeFeeds.constants';
import { buildYouTubeFeedFormData } from '../utils/youtubeFeedPresentation';

export function useYouTubeFeedEditor() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_YOUTUBE_FEED_FORM });

  function handleFormChange(key, value) {
    setFormData((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function handleEdit(feed) {
    setEditingId(feed.id);
    setFormData(buildYouTubeFeedFormData(feed));
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...EMPTY_YOUTUBE_FEED_FORM });
  }

  function toggleForm() {
    if (showForm) {
      handleCancel();
      return;
    }

    setEditingId(null);
    setFormData({ ...EMPTY_YOUTUBE_FEED_FORM });
    setShowForm(true);
  }

  function applyChannelLookup(match) {
    setFormData((previous) => ({
      ...previous,
      channel_id: match.channel_id,
      display_name: match.display_name,
      channel_url: match.channel_url || '',
    }));
  }

  return {
    applyChannelLookup,
    editingId,
    formData,
    handleCancel,
    handleEdit,
    handleFormChange,
    showForm,
    toggleForm,
  };
}
