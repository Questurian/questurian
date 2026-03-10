import { useState } from 'react';
import { useSearchYouTubeChannel } from '../../../../hooks';
import { useDialog } from '../../../../providers/DialogProvider';
import { DEFAULT_YOUTUBE_CHANNEL_SEARCH_RESULTS } from '../constants/youtubeFeeds.constants';

export function useYouTubeChannelLookup({ onPopulate }) {
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const dialog = useDialog();
  const searchChannel = useSearchYouTubeChannel();

  async function handleLookupChannel() {
    const query = lookupQuery.trim();

    if (!query) {
      await dialog.alert('Enter a channel name to search.');
      return;
    }

    try {
      const results = await searchChannel.mutateAsync({
        maxResults: DEFAULT_YOUTUBE_CHANNEL_SEARCH_RESULTS,
        query,
      });

      if (!results?.length) {
        setLookupResult(null);
        await dialog.alert('No channels found. Try a different name.');
        return;
      }

      const match = results[0];
      setLookupResult(match);
      onPopulate(match);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  function resetLookup() {
    setLookupQuery('');
    setLookupResult(null);
  }

  return {
    handleLookupChannel,
    isPending: searchChannel.isPending,
    lookupQuery,
    lookupResult,
    resetLookup,
    setLookupQuery,
  };
}
