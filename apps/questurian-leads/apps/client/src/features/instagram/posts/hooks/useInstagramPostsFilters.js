import { useState } from 'react';
import { INITIAL_INSTAGRAM_POST_FILTERS } from '../constants/instagramPosts.constants';

export function useInstagramPostsFilters() {
  const [values, setValues] = useState(INITIAL_INSTAGRAM_POST_FILTERS);

  function handleChange(key, value) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function clear() {
    setValues(INITIAL_INSTAGRAM_POST_FILTERS);
  }

  return {
    clear,
    handleChange,
    values,
  };
}
