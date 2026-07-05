const TOKEN_KEY = "stressforge_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => req<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b),
  del: <T>(p: string, b?: unknown) => req<T>("DELETE", p, b),
};

/** Stream an AI (SSE) endpoint; calls onEvent for each parsed event. */
export async function aiStream(
  path: string,
  body: unknown,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) {
        try {
          onEvent(event, JSON.parse(data));
        } catch {
          /* ignore heartbeats */
        }
      }
    }
  }
}

// ---- Types (loose, matching the API responses) ----
export interface Component {
  id: string;
  name: string;
  kind: string;
  responsibilities: string[];
  techAssumptions: string[];
}
export interface Edge {
  from: string;
  to: string;
  kind: string;
}
export interface Stressor {
  id: string;
  name: string;
  category: string;
  novelty: number;
  description: string;
  horizon: string;
}
export interface Affect {
  stressorId: string;
  componentId: string;
  impact: number;
}
export interface Residue {
  id: string;
  name: string;
  intent: string;
  minimalChangeDescription: string;
  appliesToStressors: string[];
  integrated: boolean;
  estimatedCost?: string;
}
export interface Metrics {
  N: number;
  K: number;
  regime: string;
  enabledStressorCount: number;
  componentCriticality: Record<string, number>;
  stressorBlastRadius: Record<string, number>;
  coupledPairs: { a: string; b: string; sharedStressors: number }[];
  hotComponents: string[];
  coverage: number;
  residualIndex: number | null;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  role?: string;
}
