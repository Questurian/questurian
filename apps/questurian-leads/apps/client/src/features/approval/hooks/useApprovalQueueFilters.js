import { useMemo, useState } from 'react';
import {
  APPROVAL_ARTICLE_CONTENT_TYPES,
  APPROVAL_FILTERS,
} from '../constants/approval.constants';

export function useApprovalQueueFilters() {
  const [value, setValue] = useState(APPROVAL_FILTERS.all);

  const contentType = useMemo(() => {
    if (value === APPROVAL_FILTERS.all) return null;
    if (value === APPROVAL_FILTERS.articles) {
      return APPROVAL_ARTICLE_CONTENT_TYPES;
    }
    return value;
  }, [value]);

  return {
    contentType,
    setValue,
    value,
  };
}
