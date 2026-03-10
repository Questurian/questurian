export function buildFeedFetchCompletedMessage(result) {
  return `Fetch completed!\nStatus: ${result.status}\nLeads collected: ${result.lead_count}${result.error_message ? `\nErrors: ${result.error_message}` : ''}`;
}

export function buildFeedFetchStatusMessage(feedName, hasErrors) {
  return `${feedName} fetch ${hasErrors ? 'finished with errors' : 'completed'}.`;
}

export function buildFeedFetchAllStatusMessage(results) {
  const failures = results.filter((result) => result.status === 'FAILED').length;
  const totalLeads = results.reduce(
    (total, result) => total + (result.lead_count || 0),
    0,
  );
  const tone = failures > 0 ? 'warning' : 'success';

  return {
    message: `Fetch complete for ${results.length} feeds. ${totalLeads} leads collected${failures ? `, ${failures} failed` : ''}.`,
    tone,
  };
}
