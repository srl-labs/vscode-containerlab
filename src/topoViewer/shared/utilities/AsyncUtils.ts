export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* eslint-disable no-unused-vars */
export function debounce<TArgs extends any[]>(
  fn: (...args: TArgs) => unknown,
  wait: number
): (...args: TArgs) => void {
  /* eslint-enable no-unused-vars */
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...params: TArgs) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...params), wait);
  };
}
