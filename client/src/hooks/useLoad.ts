import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { errorMessage } from "../api";

// Loads data for a page and tracks the loading and error states.
// reload() refreshes quietly, so live updates don't flash a loading message.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // If two loads overlap, only the newest result counts
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const result = await loadRef.current();
      if (id === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === latest.current) setError(errorMessage(err));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}
