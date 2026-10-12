export class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter = 0) {
    super(message);
  }
}

export async function request<T>(
  url: string,
  method = "GET",
  payload?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const seconds = retry && /^\d+$/.test(retry)
      ? Number(retry)
      : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : data?.retryAfter;
    throw new RequestError(
      data?.error || (response.status === 429
        ? "Too many requests. Please wait before trying again."
        : "Unable to connect. Please try again."),
      response.status,
      response.status === 429 ? Math.max(1, Number(seconds) || 60) : 0,
    );
  }
  if (data === undefined) throw new RequestError("The server returned an incomplete response. Please reconnect.", response.status);
  return data as T;
}
