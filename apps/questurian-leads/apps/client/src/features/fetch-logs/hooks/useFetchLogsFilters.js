import { useState } from 'react';
import { INITIAL_FETCH_LOG_FILTERS } from '../constants/fetchLogs.constants';

export function useFetchLogsFilters() {
  const [values, setValues] = useState(INITIAL_FETCH_LOG_FILTERS);

  function handleChange(key, value) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function clear() {
    setValues(INITIAL_FETCH_LOG_FILTERS);
  }

  return {
    clear,
    handleChange,
    values,
  };
}
