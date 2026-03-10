import { useState } from 'react';

export function useFeedFetchStatus() {
  const [fetchStatus, setFetchStatus] = useState(null);
  const [activeFetchId, setActiveFetchId] = useState(null);

  function updateFetchStatus(tone, message) {
    setFetchStatus({
      message,
      timestamp: new Date().toLocaleTimeString(),
      tone,
    });
  }

  return {
    activeFetchId,
    fetchStatus,
    setActiveFetchId,
    updateFetchStatus,
  };
}
