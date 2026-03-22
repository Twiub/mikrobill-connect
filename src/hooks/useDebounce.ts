import { useState, useEffect } from "react";

/**
 * useDebounce — delays updating the returned value until after `delay` ms
 * have elapsed since the last change to `value`.
 *
 * Usage:
 *   const debouncedSearch = useDebounce(search, 300);
 *   useEffect(() => { fetchData(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
