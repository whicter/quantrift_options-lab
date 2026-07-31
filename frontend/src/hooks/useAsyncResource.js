import { useEffect, useState } from 'react';

export default function useAsyncResource(load) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(load)
      .then(value => {
        if (active) setData(value);
      })
      .catch(reason => {
        if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [load]);

  return { data, error };
}
