import type {
  SSEComplete,
  SSEImageDone,
  SSEImageFailed,
  SSEImageProgress,
  SSEImageStarted,
} from "../types";

export interface SSEHandlers {
  onStarted?: (e: SSEImageStarted) => void;
  onProgress?: (e: SSEImageProgress) => void;
  onDone?: (e: SSEImageDone) => void;
  onFailed?: (e: SSEImageFailed) => void;
  onComplete?: (e: SSEComplete) => void;
  onError?: (err: unknown) => void;
}

export interface SSESubscription {
  close: () => void;
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function subscribeProcess(taskId: string, handlers: SSEHandlers): SSESubscription {
  const url = `/api/process/stream/${encodeURIComponent(taskId)}`;
  const es = new EventSource(url);

  es.addEventListener("image_started", (ev) => {
    const data = safeParse<SSEImageStarted>((ev as MessageEvent).data);
    if (data) handlers.onStarted?.(data);
  });
  es.addEventListener("image_progress", (ev) => {
    const data = safeParse<SSEImageProgress>((ev as MessageEvent).data);
    if (data) handlers.onProgress?.(data);
  });
  es.addEventListener("image_done", (ev) => {
    const data = safeParse<SSEImageDone>((ev as MessageEvent).data);
    if (data) handlers.onDone?.(data);
  });
  es.addEventListener("image_failed", (ev) => {
    const data = safeParse<SSEImageFailed>((ev as MessageEvent).data);
    if (data) handlers.onFailed?.(data);
  });
  es.addEventListener("complete", (ev) => {
    const data = safeParse<SSEComplete>((ev as MessageEvent).data) ?? { processed: 0, failed: 0 };
    handlers.onComplete?.(data);
    es.close();
  });
  es.onerror = (err) => {
    handlers.onError?.(err);
  };

  return { close: () => es.close() };
}
