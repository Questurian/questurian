import { useState } from 'react';
import {
  INITIAL_LEAD_FILTERS,
  SHOW_TRANSLATED_DEFAULT,
} from '../constants/leads.constants';

export function useLeadsPageFilters() {
  const [values, setValues] = useState({ ...INITIAL_LEAD_FILTERS });

  function handleFilterChange(key, value) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function clearFilters() {
    setValues({ ...INITIAL_LEAD_FILTERS });
  }

  return {
    clearFilters,
    handleFilterChange,
    showTranslated: SHOW_TRANSLATED_DEFAULT,
    values,
  };
}
