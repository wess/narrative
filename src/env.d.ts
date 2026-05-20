declare global {
  const butter: {
    invoke: (action: string, data?: unknown, opts?: { timeout?: number }) => Promise<unknown>;
    on: (action: string, handler: (data: unknown) => void) => void;
    off: (action: string, handler: (data: unknown) => void) => void;
  };

  // Non-standard but supported in WebKit — used by the find-in-note bar.
  interface Window {
    find?: (
      text: string,
      caseSensitive?: boolean,
      backwards?: boolean,
      wrapAround?: boolean,
    ) => boolean;
  }
}

export {};
