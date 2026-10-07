export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return {};
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export const post = (path, body) =>
  request(path, { method: "POST", body: JSON.stringify(body) });
