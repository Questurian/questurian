import { useState } from 'react';
import { INITIAL_EL_COMERCIO_POST_FILTERS } from '../constants/elComercioPosts.constants';

export function useElComercioPostsFilters() {
  const [values, setValues] = useState(INITIAL_EL_COMERCIO_POST_FILTERS);

  function handleChange(key, value) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function clear() {
    setValues(INITIAL_EL_COMERCIO_POST_FILTERS);
  }

  return {
    clear,
    handleChange,
    values,
  };
}
