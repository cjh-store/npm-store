import { EventSourceMessage, getBytes, getLines, getMessages } from "./parse";

export const EventStreamContentType = "text/event-stream";

const DefaultRetryInterval = 1000;
const LastEventId = "last-event-id";

export interface FetchEventSourceInit extends RequestInit {
  headers?: Record<string, string>;
  onopen?: (response: Response) => Promise<void>;
  onmessage?: (ev: EventSourceMessage) => void;
  onclose?: () => void;
  onerror?: (err: any) => number | null | undefined | void;
  openWhenHidden?: boolean;
  fetch?: typeof fetch;
}

export function fetchEventSource(
  input: RequestInfo,
  {
    signal: inputSignal,
    headers: inputHeaders,
    onopen: inputOnOpen,
    onmessage,
    onclose,
    onerror,
    openWhenHidden,
    fetch: inputFetch,
    ...rest
  }: FetchEventSourceInit
) {
  return new Promise<void>((resolve, reject) => {
    const headers = { ...inputHeaders };
    if (!headers.accept) {
      headers.accept = EventStreamContentType;
    }

    let curRequestController: AbortController;
    let isCompleted = false;
    let isAborting = false;

    function onVisibilityChange() {
      if (document.hidden) {
        isAborting = true;
        curRequestController.abort();
      } else if (!isCompleted) {
        isAborting = false;
        create();
      }
    }

    if (!openWhenHidden) {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    let retryInterval = DefaultRetryInterval;
    let retryTimer = 0;

    function dispose() {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(retryTimer);
      if (!isCompleted && !isAborting) {
        curRequestController.abort();
      }
    }

    inputSignal?.addEventListener("abort", () => {
      isAborting = true;
      dispose();
      resolve();
    });

    const fetch = inputFetch ?? window.fetch;
    const onopen = inputOnOpen ?? defaultOnOpen;

    async function create() {
      curRequestController = new AbortController();
      try {
        const response = await fetch(input, {
          ...rest,
          headers,
          signal: curRequestController.signal,
        });

        await onopen(response);

        await getBytes(
          response.body!,
          getLines(
            getMessages(
              (id) => {
                if (id) {
                  headers[LastEventId] = id;
                } else {
                  delete headers[LastEventId];
                }
              },
              (retry) => {
                retryInterval = retry;
              },
              onmessage
            )
          )
        );

        isCompleted = true;
        onclose?.();
        dispose();
        resolve();
      } catch (err: any) {
        if (!curRequestController.signal.aborted) {
          try {
            // 如果是 AbortError 且是正常中断，不重试
            if (err.name === "AbortError" && isAborting) {
              return;
            }
            const interval: any = onerror?.(err) ?? retryInterval;
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(create, interval);
          } catch (innerErr) {
            dispose();
            reject(innerErr);
          }
        }
      }
    }

    create();
  });
}

function defaultOnOpen(response: Response) {
  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith(EventStreamContentType)) {
    throw new Error(
      `Expected content-type to be ${EventStreamContentType}, Actual: ${contentType}`
    );
  }
}
