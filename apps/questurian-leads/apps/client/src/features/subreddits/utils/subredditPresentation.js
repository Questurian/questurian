import { EMPTY_SUBREDDIT_FORM } from '../constants/subreddits.constants';

export function buildSubredditFormData(subreddit) {
  return {
    ...EMPTY_SUBREDDIT_FORM,
    category_id: subreddit.category_id,
    subreddit: subreddit.subreddit,
    display_name: subreddit.display_name,
    description: subreddit.description || '',
  };
}

export function buildSubredditUrl(subreddit) {
  return `https://reddit.com/r/${subreddit}`;
}

export function truncateSubredditDescription(text, maxLength = 80) {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function formatSubredditDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
