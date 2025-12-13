export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce<TArgs extends any[]>(
  fn: (...args: TArgs) => unknown,
  wait: number
): (...args: TArgs) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...params: TArgs) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...params), wait);
  };
}
