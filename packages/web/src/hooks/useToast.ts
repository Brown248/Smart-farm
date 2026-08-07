import { useCallback, useEffect, useRef, useState } from 'react';

export const TOAST_MS = 2800;

export interface ToastApi {
  readonly toast: string | null;
  readonly flash: (message: string) => void;
}

export function useToast(durationMs = TOAST_MS): ToastApi {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const flash = useCallback(
    (message: string) => {
      setToast(message);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { toast, flash };
}
