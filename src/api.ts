// Postgres-backed API – calls /api/rpc
async function call(method: string, args: any = {}) {
  const r = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
export const api: any = new Proxy({}, {
  get(_, prop: string) {
    return (args: any = {}) => call(prop, args);
  }
});
export type ApiResponse<T, K extends keyof T> = any;
export type ApiRequest<T, K extends keyof T> = any;
