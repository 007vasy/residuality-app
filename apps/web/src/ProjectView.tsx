import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  aiStream,
  api,
  getToken,
  type Affect,
  type Component,
  type Edge,
  type Metrics,
  type Residue,
  type Stressor,
} from "./api";

type Tab = "matrix" | "graph" | "stressors" | "residues" | "risk" | "settings";

export function ProjectView({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("matrix");
  const [components, setComponents] = useState<Component[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [stressors, setStressors] = useState<Stressor[]>([]);
  const [affects, setAffects] = useState<Affect[]>([]);
  const [residues, setResidues] = useState<Residue[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const loadArchitecture = useCallback(async () => {
    const a = await api.get<{ components: Component[]; edges: Edge[] }>(`/projects/${projectId}/architecture`);
    setComponents(a.components);
    setEdges(a.edges);
  }, [projectId]);

  const loadStressors = useCallback(async () => {
    const s = await api.get<{ stressors: Stressor[]; affects: Affect[] }>(`/projects/${projectId}/stressors`);
    setStressors(s.stressors);
    setAffects(s.affects);
    setEnabled((prev) => {
      // Enable any newly-seen stressor by default.
      const next = new Set(prev);
      const known = new Set(prev);
      let changed = false;
      for (const st of s.stressors) if (!known.has(st.id)) {
        next.add(st.id);
        changed = true;
      }
      return changed || prev.size === 0 ? new Set(s.stressors.map((x) => x.id)) : prev;
    });
  }, [projectId]);

  const loadResidues = useCallback(async () => {
    const r = await api.get<{ residues: Residue[] }>(`/projects/${projectId}/residues`);
    setResidues(r.residues);
  }, [projectId]);

  const loadMetrics = useCallback(async () => {
    const en = [...enabledRef.current];
    const q = en.length ? `?enabled=${en.join(",")}` : "";
    const m = await api.get<{ metrics: Metrics }>(`/projects/${projectId}/metrics${q}`);
    setMetrics(m.metrics);
  }, [projectId]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadArchitecture(), loadStressors(), loadResidues()]);
    await loadMetrics();
  }, [loadArchitecture, loadStressors, loadResidues, loadMetrics]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // Recompute metrics whenever the enabled scenario changes.
  useEffect(() => {
    if (stressors.length) loadMetrics();
  }, [enabled, stressors.length, loadMetrics]);

  // Live collaboration: refetch on broadcast.
  useEffect(() => {
    const token = getToken();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?projectId=${projectId}&token=${token}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "changed") {
          if (msg.resources.includes("architecture")) loadArchitecture();
          if (msg.resources.includes("stressors")) loadStressors();
          if (msg.resources.includes("residues") || msg.resources.includes("attractors")) loadResidues();
          if (msg.resources.includes("metrics")) loadMetrics();
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [projectId, loadArchitecture, loadStressors, loadResidues, loadMetrics]);

  function toggleStressorEnabled(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleAffect(stressorId: string, componentId: string, on: boolean) {
    await api.put(`/projects/${projectId}/affects`, { stressorId, componentId, on });
    await loadStressors();
    await loadMetrics();
  }

  async function seed() {
    setBusy("Seeding EV-charging demo…");
    try {
      await api.post(`/projects/${projectId}/seed`);
      await reloadAll();
    } finally {
      setBusy(null);
    }
  }

  async function generateStressors(count: number, label: string) {
    setBusy(label);
    try {
      await aiStream(`/projects/${projectId}/ai/generate-stressors`, { count, focus: [] }, (event, data) => {
        if (event === "error") throw new Error(data.message);
      });
      await loadStressors();
      await loadMetrics();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deriveResidue(stressorId: string) {
    setBusy("Deriving attractor + residue…");
    try {
      await aiStream(`/projects/${projectId}/ai/derive-residue`, { stressorId }, (event, data) => {
        if (event === "error") throw new Error(data.message);
      });
      await loadResidues();
      await loadMetrics();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={onBack}>← Projects</button>
        <div className="spacer" />
        <button onClick={seed} disabled={!!busy}>
          Seed EV demo
        </button>
        <button
          onClick={() => generateStressors(30, "Generating a diverse stressor set with your key…")}
          disabled={!!busy}
          title="AI-generate ~30 stressors spanning all categories, from your BYOK key"
        >
          ✨ Generate stressors (AI)
        </button>
        <button
          onClick={() => generateStressors(10, "Simulating 10 wild, high-novelty stressors…")}
          disabled={!!busy}
          title="AI-generate 10 deliberately extreme 'black swan' stressors to probe the unexpected"
        >
          🎲 Suggest 10 wild stressors
        </button>
        <a href={`/api/projects/${projectId}/export`} onClick={(e) => downloadExport(e, projectId)}>
          <button>Export state.json</button>
        </a>
      </div>
      {busy && <div className="panel muted">{busy}</div>}

      {metrics && <MetricsBar metrics={metrics} stressorCount={stressors.length} />}

      <div className="tabs">
        {(["matrix", "graph", "stressors", "residues", "risk", "settings"] as Tab[]).map((t) => (
          <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {tab === "matrix" && (
        <MatrixGrid
          components={components}
          stressors={stressors}
          affects={affects}
          enabled={enabled}
          metrics={metrics}
          onToggleStressor={toggleStressorEnabled}
          onToggleAffect={toggleAffect}
        />
      )}
      {tab === "graph" && <ArchitectureGraph components={components} edges={edges} metrics={metrics} />}
      {tab === "stressors" && (
        <StressorBoard
          projectId={projectId}
          stressors={stressors}
          residues={residues}
          onDerive={deriveResidue}
          onReload={loadStressors}
          busy={!!busy}
        />
      )}
      {tab === "residues" && <ResidueList residues={residues} stressors={stressors} />}
      {tab === "risk" && (
        <RiskDashboard metrics={metrics} components={components} stressors={stressors} residues={residues} />
      )}
      {tab === "settings" && <Settings projectId={projectId} />}
    </div>
  );
}

function downloadExport(e: React.MouseEvent, projectId: string) {
  e.preventDefault();
  const token = getToken();
  fetch(`/api/projects/${projectId}/export`, { headers: { authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((b) => {
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = "state.json";
      a.click();
      URL.revokeObjectURL(url);
    });
}

/** A single 0–100 roll-up of coverage, regime, and coupling. Original heuristic. */
function resilienceScore(m: Metrics): number {
  const regimeFactor = m.regime.startsWith("edge")
    ? 1
    : m.regime.startsWith("frozen")
      ? 0.5
      : m.regime.startsWith("chaotic")
        ? 0.3
        : 0.5; // indeterminate
  const score = 100 * (0.6 * m.coverage + 0.4 * regimeFactor);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function MetricsBar({ metrics, stressorCount }: { metrics: Metrics; stressorCount: number }) {
  const regimeClass = metrics.regime.startsWith("frozen")
    ? "regime-frozen"
    : metrics.regime.startsWith("chaotic")
      ? "regime-chaotic"
      : "regime-edge";
  const score = resilienceScore(metrics);
  const scoreColor = score >= 70 ? "var(--edge)" : score >= 45 ? "#e0b341" : "var(--chaotic)";
  return (
    <div className="panel row" style={{ justifyContent: "space-around" }}>
      <div className="metric" title="Composite 0–100 roll-up of residue coverage, regime, and coupling">
        <div className="val" style={{ color: scoreColor }}>{score}</div>
        <div className="lbl">Resilience Score</div>
      </div>
      <div className="metric">
        <div className="val">{metrics.N}</div>
        <div className="lbl">Components (N)</div>
      </div>
      <div className="metric">
        <div className="val">{metrics.K.toFixed(2)}</div>
        <div className="lbl">Coupling (K)</div>
      </div>
      <div className="metric">
        <div className={`val ${regimeClass}`}>{metrics.regime.split(" ")[0]}</div>
        <div className="lbl">Regime</div>
      </div>
      <div className="metric">
        <div className="val">
          {metrics.enabledStressorCount}/{stressorCount}
        </div>
        <div className="lbl">Stressors on</div>
      </div>
      <div className="metric">
        <div className="val">{Math.round(metrics.coverage * 100)}%</div>
        <div className="lbl">Residue coverage</div>
      </div>
      <div className="metric">
        <div className="val">{metrics.residualIndex == null ? "—" : metrics.residualIndex.toFixed(2)}</div>
        <div className="lbl">Residual index</div>
      </div>
    </div>
  );
}

function critColor(crit: number, max: number): string {
  if (crit <= 0 || max <= 0) return "transparent";
  const t = crit / max;
  const r = Math.round(74 + t * (255 - 74));
  const g = Math.round(158 - t * 100);
  const b = Math.round(255 - t * 200);
  return `rgba(${r},${g},${b},${0.25 + t * 0.45})`;
}

function MatrixGrid({
  components,
  stressors,
  affects,
  enabled,
  metrics,
  onToggleStressor,
  onToggleAffect,
}: {
  components: Component[];
  stressors: Stressor[];
  affects: Affect[];
  enabled: Set<string>;
  metrics: Metrics | null;
  onToggleStressor: (id: string) => void;
  onToggleAffect: (s: string, c: string, on: boolean) => void;
}) {
  const affectSet = useMemo(() => new Set(affects.map((a) => `${a.stressorId}|${a.componentId}`)), [affects]);
  const crit = metrics?.componentCriticality ?? {};
  const maxCrit = Math.max(1, ...Object.values(crit));
  const hot = new Set(metrics?.hotComponents ?? []);

  if (components.length === 0 || stressors.length === 0) {
    return (
      <div className="panel muted">
        Add components and stressors (or “Seed EV demo”) to build the incidence matrix. Rows are stressors, columns are
        components. Toggle a stressor row on/off to see risk recompute live.
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="muted" style={{ marginBottom: 8 }}>
        Rows = stressors, columns = components. Click a cell to set which components a stressor hits. Toggle the ● to
        enable/disable a stressor in the current scenario — metrics above recompute live.
      </div>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="rowhdr">stressor \ component</th>
              {components.map((c) => (
                <th key={c.id} title={c.name} style={{ background: hot.has(c.id) ? "var(--hot)" : undefined }}>
                  {c.id}
                </th>
              ))}
            </tr>
            <tr>
              <th className="rowhdr muted">criticality →</th>
              {components.map((c) => (
                <th key={c.id} className="crit-cell" style={{ background: critColor(crit[c.id] ?? 0, maxCrit) }}>
                  {crit[c.id] ?? 0}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stressors.map((s) => {
              const on = enabled.has(s.id);
              return (
                <tr key={s.id} style={{ opacity: on ? 1 : 0.45 }}>
                  <th className="rowhdr" title={s.description}>
                    <span className="toggle" onClick={() => onToggleStressor(s.id)}>
                      {on ? "🔵" : "⚪"}
                    </span>{" "}
                    <span className="cat">{s.category}</span> {s.name.slice(0, 34)}
                  </th>
                  {components.map((c) => {
                    const cellOn = affectSet.has(`${s.id}|${c.id}`);
                    return (
                      <td
                        key={c.id}
                        className={cellOn ? "cell-on" : "cell-off"}
                        onClick={() => onToggleAffect(s.id, c.id, !cellOn)}
                      >
                        {cellOn ? "●" : "·"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchitectureGraph({
  components,
  edges,
  metrics,
}: {
  components: Component[];
  edges: Edge[];
  metrics: Metrics | null;
}) {
  const W = 900;
  const H = 420;
  const cx = W / 2;
  const cy = H / 2;
  const rad = Math.min(W, H) / 2 - 60;
  const crit = metrics?.componentCriticality ?? {};
  const maxCrit = Math.max(1, ...Object.values(crit));
  const hot = new Set(metrics?.hotComponents ?? []);
  const pos = new Map<string, { x: number; y: number }>();
  components.forEach((c, i) => {
    const ang = (2 * Math.PI * i) / Math.max(1, components.length) - Math.PI / 2;
    pos.set(c.id, { x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) });
  });

  if (components.length === 0) return <div className="panel muted">No components yet.</div>;

  return (
    <div className="panel">
      <svg className="svg-graph" viewBox={`0 0 ${W} ${H}`}>
        {edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a4757" strokeWidth={1.5} />;
        })}
        {components.map((c) => {
          const p = pos.get(c.id)!;
          const cv = crit[c.id] ?? 0;
          const r = 16 + (cv / maxCrit) * 18;
          const fill = hot.has(c.id) ? "#ff5252" : critColor(cv, maxCrit) || "#2a3441";
          return (
            <g key={c.id}>
              <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="#4a9eff" strokeWidth={1.5} />
              <text x={p.x} y={p.y - r - 6} textAnchor="middle" fill="#dbe3ec" fontSize={11}>
                {c.name.slice(0, 20)}
              </text>
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#04121f" fontSize={11} fontWeight={700}>
                {cv}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="muted" style={{ marginTop: 8 }}>
        Node size &amp; colour = live criticality (how many enabled stressors hit it). Red = hotspot.
      </div>
    </div>
  );
}

function StressorBoard({
  projectId,
  stressors,
  residues,
  onDerive,
  onReload,
  busy,
}: {
  projectId: string;
  stressors: Stressor[];
  residues: Residue[];
  onDerive: (id: string) => void;
  onReload: () => void;
  busy: boolean;
}) {
  const coveredStressors = useMemo(() => {
    const s = new Set<string>();
    for (const r of residues) for (const sid of r.appliesToStressors) s.add(sid);
    return s;
  }, [residues]);
  const byCat = useMemo(() => {
    const m = new Map<string, Stressor[]>();
    for (const s of stressors) {
      const l = m.get(s.category) ?? [];
      l.push(s);
      m.set(s.category, l);
    }
    return [...m.entries()].sort();
  }, [stressors]);

  async function del(id: string) {
    await api.del(`/projects/${projectId}/stressors/${id}`);
    onReload();
  }

  return (
    <div>
      {byCat.map(([cat, list]) => (
        <div className="panel" key={cat}>
          <div className="cat" style={{ marginBottom: 8 }}>
            {cat} ({list.length})
          </div>
          <div className="list">
            {list.map((s) => (
              <div className="item" key={s.id}>
                <div className="row">
                  <b>{s.name}</b>
                  <span className="badge">novelty {s.novelty}</span>
                  <span className="badge">{s.horizon}</span>
                  {coveredStressors.has(s.id) && <span className="badge ok">has residue</span>}
                  <div className="spacer" />
                  <button onClick={() => onDerive(s.id)} disabled={busy}>
                    ✨ Derive residue
                  </button>
                  <button onClick={() => del(s.id)}>✕</button>
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {s.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {stressors.length === 0 && <div className="panel muted">No stressors yet. Seed the demo or generate with AI.</div>}
    </div>
  );
}

function ResidueList({ residues, stressors }: { residues: Residue[]; stressors: Stressor[] }) {
  const names = new Map(stressors.map((s) => [s.id, s.name]));
  return (
    <div className="panel">
      <div className="muted" style={{ marginBottom: 8 }}>
        The residue stack — the minimal changes that let the business survive each stressor. Together they are the
        resilient (residual) architecture.
      </div>
      <div className="list">
        {residues.map((r) => (
          <div className="item" key={r.id}>
            <div className="row">
              <b>{r.name}</b>
              {r.estimatedCost && <span className="badge">cost: {r.estimatedCost}</span>}
              <span className="badge">{r.appliesToStressors.length} stressor(s)</span>
            </div>
            <div style={{ marginTop: 4 }}>{r.minimalChangeDescription}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              covers: {r.appliesToStressors.map((s) => names.get(s) ?? s).join(", ")}
            </div>
          </div>
        ))}
        {residues.length === 0 && <div className="muted">No residues yet. Derive them from stressors on the Stressors tab.</div>}
      </div>
    </div>
  );
}

/** Regime → plain-language risk meaning for the verdict banner. */
function regimeMeaning(regime: string): { label: string; cls: string; text: string } {
  if (regime.startsWith("frozen"))
    return {
      label: "Frozen",
      cls: "regime-frozen",
      text: "Rigid — the system struggles to absorb novelty. A single unhandled event has an outsized effect. Add diverse resilient elements to climb toward the adaptive band.",
    };
  if (regime.startsWith("chaotic"))
    return {
      label: "Chaotic",
      cls: "regime-chaotic",
      text: "Over-coupled — small failures cascade widely and incidents have a large blast radius. Reduce coupling and add isolation between the components that fail together.",
    };
  if (regime.startsWith("edge"))
    return {
      label: "Edge of chaos",
      cls: "regime-edge",
      text: "Adaptive — perturbations are contained but learn-able from. This is the target band: high enough coupling to adapt, low enough to contain failures.",
    };
  return {
    label: "Indeterminate",
    cls: "",
    text: "Not enough data for a meaningful verdict yet. Add more stressors and derive resilient elements, then re-check — a criticality reading on a thin model is misleading.",
  };
}

/**
 * Generic, widely-documented resilience patterns suggested by the current regime.
 * These are general software-resilience practices, not authoritative prescriptions —
 * and the regime thresholds behind them are this app's own tuning parameters.
 */
function recommendedActions(m: Metrics, topPair?: { a: string; b: string }): string[] {
  if (m.regime.startsWith("frozen"))
    return [
      "Add a circuit breaker with a fallback cache on your most-loaded read path so one dependency can't freeze the whole flow.",
      "Give a write-critical surface a read-only degraded mode so it stays partially available under stress.",
      "Add a bulkhead where one tenant or downstream can starve the rest — contain, don't share, the failure.",
    ];
  if (m.regime.startsWith("chaotic"))
    return [
      topPair
        ? `Decouple ${topPair.a} and ${topPair.b} (they fail together) — put a queue or circuit breaker between them.`
        : "Decouple the most tightly-coupled components — put a queue or circuit breaker between them.",
      "Add tenant / blast-radius isolation so one component's defect can't contaminate the others.",
      "Add an immutable audit trail so cascading incidents stay investigable.",
    ];
  if (m.regime.startsWith("edge"))
    return [
      "You're in the target band — keep coverage high as the architecture grows.",
      "Stress-test the edge: toggle on your wildest stressors and watch whether coupling (K) tips you toward chaotic.",
    ];
  return [
    "Generate a diverse stressor set (all categories, including a few wild ones).",
    "Derive a resilient element for each high-blast-radius stressor, then re-check the verdict.",
  ];
}

function RiskDashboard({
  metrics,
  components,
  stressors,
  residues,
}: {
  metrics: Metrics | null;
  components: Component[];
  stressors: Stressor[];
  residues: Residue[];
}) {
  const compName = useMemo(() => new Map(components.map((c) => [c.id, c.name])), [components]);
  const covered = useMemo(() => {
    const s = new Set<string>();
    for (const r of residues) for (const sid of r.appliesToStressors) s.add(sid);
    return s;
  }, [residues]);

  if (!metrics || components.length === 0 || stressors.length === 0) {
    return (
      <div className="panel muted">
        No risk to assess yet. Add components and stressors — or “Seed demo” — then this page shows your resilience
        verdict, top risks, and recommended actions.
      </div>
    );
  }

  const crit = metrics.componentCriticality;
  const maxCrit = Math.max(1, ...Object.values(crit));
  const hot = new Set(metrics.hotComponents);
  const score = resilienceScore(metrics);
  const scoreColor = score >= 70 ? "var(--edge)" : score >= 45 ? "#e0b341" : "var(--chaotic)";
  const verdict = regimeMeaning(metrics.regime);

  const topComponents = [...components]
    .map((c) => ({ c, v: crit[c.id] ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);

  const topStressors = [...stressors]
    .map((s) => ({ s, v: metrics.stressorBlastRadius[s.id] ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);

  const gaps = stressors
    .filter((s) => !covered.has(s.id))
    .sort((a, b) => b.novelty - a.novelty);

  const pairs = [...metrics.coupledPairs].sort((a, b) => b.sharedStressors - a.sharedStressors).slice(0, 8);
  const topPair =
    pairs[0] && { a: compName.get(pairs[0].a) ?? pairs[0].a, b: compName.get(pairs[0].b) ?? pairs[0].b };
  const actions = recommendedActions(metrics, topPair);

  return (
    <div>
      {/* 1. Verdict banner */}
      <div className="panel">
        <div className="row" style={{ alignItems: "center", gap: 20 }}>
          <div className="metric">
            <div className="val" style={{ color: scoreColor }}>{score}</div>
            <div className="lbl">Resilience Score</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }} className={verdict.cls}>
              {verdict.label}
            </div>
            <div className="muted">{verdict.text}</div>
          </div>
          <button onClick={() => window.print()} title="Open the browser print dialog to save a PDF">
            🖨 Print risk report
          </button>
        </div>
      </div>

      {/* 2. Executive summary tiles */}
      <div className="panel row" style={{ justifyContent: "space-around" }}>
        <div className="metric"><div className="val">{metrics.N}</div><div className="lbl">Components</div></div>
        <div className="metric"><div className="val">{metrics.K.toFixed(2)}</div><div className="lbl">Coupling (K)</div></div>
        <div className="metric"><div className="val">{Math.round(metrics.coverage * 100)}%</div><div className="lbl">Mitigation coverage</div></div>
        <div className="metric"><div className="val">{metrics.residualIndex == null ? "—" : metrics.residualIndex.toFixed(2)}</div><div className="lbl">Resilient index</div></div>
        <div className="metric"><div className="val">{metrics.hotComponents.length}</div><div className="lbl">Hotspots</div></div>
        <div className="metric"><div className="val">{gaps.length}</div><div className="lbl">Unaddressed</div></div>
      </div>

      <div className="grid-cards">
        {/* 3. Top critical components */}
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Most exposed components</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Where enabled stressors converge. Higher = more ways to fail.</div>
          <div className="list">
            {topComponents.map(({ c, v }) => (
              <div className="item row" key={c.id} style={{ background: critColor(v, maxCrit) }}>
                <b>{c.name}</b>
                <span className="cat">{c.kind}</span>
                {hot.has(c.id) && <span className="badge err">hotspot</span>}
                <div className="spacer" />
                <span className="badge">{v} stressor(s)</span>
              </div>
            ))}
            {topComponents.length === 0 && <div className="muted">No stressor hits mapped yet.</div>}
          </div>
        </div>

        {/* 4. Highest blast-radius stressors */}
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Highest blast-radius stressors</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>One event, many components — systemic risk.</div>
          <div className="list">
            {topStressors.map(({ s, v }) => (
              <div className="item row" key={s.id}>
                <span className="cat">{s.category}</span>
                <b>{s.name}</b>
                {!covered.has(s.id) && <span className="badge err">no mitigation</span>}
                <div className="spacer" />
                <span className="badge">hits {v}</span>
              </div>
            ))}
            {topStressors.length === 0 && <div className="muted">No stressor hits mapped yet.</div>}
          </div>
        </div>

        {/* 5. Coverage gaps */}
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Unaddressed risks</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Stressors with no resilient element yet — highest novelty first.</div>
          <div className="list">
            {gaps.slice(0, 12).map((s) => (
              <div className="item row" key={s.id}>
                <span className="cat">{s.category}</span>
                <b>{s.name}</b>
                <div className="spacer" />
                <span className="badge">novelty {s.novelty}</span>
              </div>
            ))}
            {gaps.length === 0 && <div className="ok">Every stressor has at least one resilient element. ✓</div>}
          </div>
        </div>

        {/* 6. Hidden coupling */}
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Hidden coupling</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Component pairs that fail together through a shared stressor.</div>
          <div className="list">
            {pairs.map((p, i) => (
              <div className="item row" key={i}>
                <b>{compName.get(p.a) ?? p.a}</b>
                <span className="muted">↔</span>
                <b>{compName.get(p.b) ?? p.b}</b>
                <div className="spacer" />
                <span className="badge">{p.sharedStressors} shared</span>
              </div>
            ))}
            {pairs.length === 0 && <div className="ok">No shared-stressor coupling detected. ✓</div>}
          </div>
        </div>
      </div>

      {/* 7. Recommended actions */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Recommended actions</h3>
        <div className="list">
          {actions.map((a, i) => (
            <div className="item" key={i}>{a}</div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
          Suggestions are generic, widely-documented resilience patterns — not authoritative prescriptions. The
          criticality bands (frozen / edge / chaotic) and the score are this app's own tuning parameters, provided for
          orientation, not as a probabilistic risk grade.
        </div>
      </div>
    </div>
  );
}

function Settings({ projectId }: { projectId: string }) {
  const [keys, setKeys] = useState<{ provider: string; updatedAt: string }[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [tokens, setTokens] = useState<{ label: string; createdAt: string }[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenLabel, setTokenLabel] = useState("claude-code");

  const load = () => {
    api.get<{ keys: typeof keys }>("/keys").then((r) => setKeys(r.keys));
    api.get<{ tokens: typeof tokens }>(`/projects/${projectId}/tokens`).then((r) => setTokens(r.tokens)).catch(() => {});
  };
  useEffect(() => {
    load();
  }, [projectId]);

  async function saveKey() {
    await api.put("/keys/anthropic", { apiKey });
    setApiKey("");
    load();
  }
  async function makeToken() {
    const r = await api.post<{ token: string }>(`/projects/${projectId}/tokens`, { label: tokenLabel });
    setNewToken(r.token);
    load();
  }

  return (
    <div>
      <div className="panel">
        <h3>BYOK — your Anthropic API key</h3>
        <p className="muted">
          Stored encrypted at rest (AES-256-GCM). Used for “Generate stressors” and “Derive residue”. Never returned to
          the browser.
        </p>
        <div className="row">
          <input placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" style={{ maxWidth: 360 }} />
          <button className="primary" onClick={saveKey} disabled={!apiKey}>
            Save key
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {keys.length ? `Saved: ${keys.map((k) => k.provider).join(", ")}` : "No key saved yet."}
        </div>
      </div>

      <div className="panel">
        <h3>MCP server access</h3>
        <p className="muted">
          Drive this project from Claude Code / Claude Desktop. Create a token, then add the server:
        </p>
        <pre style={{ background: "var(--panel2)", padding: 10, borderRadius: 6, overflow: "auto" }}>
{`claude mcp add stressforge --transport http \\
  ${location.origin}/mcp \\
  --header "Authorization: Bearer <token>"`}
        </pre>
        <div className="row">
          <input value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} style={{ maxWidth: 220 }} />
          <button onClick={makeToken}>Create token</button>
        </div>
        {newToken && (
          <div className="panel" style={{ marginTop: 10 }}>
            <div className="ok">Copy now — shown only once:</div>
            <code>{newToken}</code>
          </div>
        )}
        <div className="muted" style={{ marginTop: 8 }}>
          {tokens.length ? `Active tokens: ${tokens.map((t) => t.label).join(", ")}` : "No tokens yet."}
        </div>
      </div>
    </div>
  );
}
