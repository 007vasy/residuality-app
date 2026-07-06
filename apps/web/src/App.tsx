import { useEffect, useState } from "react";
import { api, DOMAIN_LABEL, getToken, setToken, type Domain, type LibraryStressor, type Project } from "./api";
import { ProjectView } from "./ProjectView";

type Open = { id: string; readOnly: boolean } | null;

export function App() {
  const [token, setTok] = useState<string | null>(getToken());
  const [me, setMe] = useState<{ email: string; displayName: string } | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const authed = !!token;

  useEffect(() => {
    if (!authed) {
      setMe(null);
      return;
    }
    api
      .get<{ user: { email: string; displayName: string } }>("/me")
      .then((r) => setMe(r.user))
      .catch(() => {
        setToken(null);
        setTok(null);
      });
  }, [authed]);

  function signOut() {
    setToken(null);
    setTok(null);
    setOpen(null);
  }

  return (
    <>
      <div className="topbar">
        <h1 style={{ cursor: "pointer" }} onClick={() => setOpen(null)}>
          🔨 StressForge
        </h1>
        <span className="muted">resilient architecture &amp; risk simulator</span>
        <div className="spacer" />
        <button onClick={() => setShowLibrary(true)}>Stressor library</button>
        <button onClick={() => setShowAbout(true)}>About</button>
        {authed ? (
          <>
            <span className="muted">{me?.email}</span>
            <button onClick={signOut}>Sign out</button>
          </>
        ) : (
          <button className="primary" onClick={() => setShowAuth(true)}>
            Sign in
          </button>
        )}
      </div>
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showLibrary && <LibraryModal onClose={() => setShowLibrary(false)} />}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={(t) => {
            setToken(t);
            setTok(t);
            setShowAuth(false);
          }}
        />
      )}
      {open ? (
        <ProjectView
          projectId={open.id}
          readOnly={open.readOnly}
          onBack={() => setOpen(null)}
          onSignInPrompt={() => setShowAuth(true)}
        />
      ) : (
        <Home authed={authed} onOpen={setOpen} onSignInPrompt={() => setShowAuth(true)} />
      )}
    </>
  );
}

const DOMAIN_ORDER: Domain[] = ["software", "company", "country", "planet"];
const DOMAIN_ICON: Record<Domain, string> = { software: "🧩", company: "🏢", country: "🌍", planet: "🪐" };

function Home({
  authed,
  onOpen,
  onSignInPrompt,
}: {
  authed: boolean;
  onOpen: (o: Open) => void;
  onSignInPrompt: () => void;
}) {
  const [publicProjects, setPublicProjects] = useState<Project[]>([]);
  const [mine, setMine] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<Domain>("software");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/public/projects").then((r) => setPublicProjects(r.projects)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!authed) return;
    api.get<{ projects: Project[] }>("/projects").then((r) => setMine(r.projects)).catch(() => {});
  }, [authed]);

  async function create() {
    if (!name.trim()) return;
    const r = await api.post<{ project: Project }>("/projects", { name, domain });
    setName("");
    onOpen({ id: r.project.id, readOnly: false });
  }

  const mineIds = new Set(mine.map((p) => p.id));
  const byDomain = DOMAIN_ORDER.map((d) => ({ d, items: publicProjects.filter((p) => p.domain === d) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="container">
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Explore the risk gallery</h2>
        <div className="muted">
          Every example below is public and read-only — no account needed. Sign in to create and stress-test your own
          systems. Four modes: software architecture, company, country, and planetary/habitat risk.
        </div>
      </div>

      {authed && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Your projects</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 240 }} />
            <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} style={{ maxWidth: 200 }}>
              {DOMAIN_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DOMAIN_ICON[d]} {DOMAIN_LABEL[d]}
                </option>
              ))}
            </select>
            <button className="primary" onClick={create}>
              Create
            </button>
          </div>
          <div className="grid-cards">
            {mine.map((p) => (
              <ProjectCard key={p.id} p={p} onClick={() => onOpen({ id: p.id, readOnly: false })} />
            ))}
            {mine.length === 0 && <div className="muted">No projects yet — create one above.</div>}
          </div>
        </div>
      )}

      {!authed && (
        <div className="panel row">
          <span className="muted">Want to build your own analysis?</span>
          <button className="primary" onClick={onSignInPrompt}>
            Sign in / register
          </button>
        </div>
      )}

      {byDomain.map(({ d, items }) => (
        <div className="panel" key={d}>
          <h3 style={{ marginTop: 0 }}>
            {DOMAIN_ICON[d]} {DOMAIN_LABEL[d]} <span className="muted" style={{ fontSize: 13 }}>({items.length})</span>
          </h3>
          <div className="grid-cards">
            {items.map((p) => (
              <ProjectCard
                key={p.id}
                p={p}
                onClick={() => onOpen({ id: p.id, readOnly: !mineIds.has(p.id) })}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({ p, onClick }: { p: Project; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
      <div className="muted" style={{ fontSize: 12, minHeight: 32 }}>
        {p.description || "No description"}
      </div>
      <div style={{ marginTop: 8 }} className="row">
        <span className="badge">{DOMAIN_ICON[p.domain]} {DOMAIN_LABEL[p.domain]}</span>
        {p.isPublic && <span className="badge ok">public</span>}
        {p.role && <span className="badge">{p.role}</span>}
      </div>
    </div>
  );
}

function LibraryModal({ onClose }: { onClose: () => void }) {
  const [lib, setLib] = useState<LibraryStressor[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get<{ library: LibraryStressor[] }>("/public/stressor-library").then((r) => setLib(r.library)).catch(() => setLib([]));
  }, []);
  const filtered = (lib ?? []).filter(
    (s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.category.includes(q.toLowerCase()),
  );
  return (
    <Modal onClose={onClose} wide>
      <h2 style={{ marginTop: 0 }}>Stressor library</h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        Every distinct stressor across the public gallery, aggregated for reuse. {lib ? `${lib.length} stressors.` : "Loading…"}
      </div>
      <input placeholder="Filter by name or category…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="list" style={{ maxHeight: "60vh", overflow: "auto" }}>
        {filtered.slice(0, 300).map((s, i) => (
          <div className="item" key={i}>
            <div className="row">
              <span className="cat">{s.category}</span>
              <b>{s.name}</b>
              <div className="spacer" />
              <span className="badge">novelty {s.novelty}</span>
              {s.usedBy > 1 && <span className="badge ok">{s.usedBy}× reuse</span>}
              <span className="badge">{s.domains.join(", ")}</span>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{s.description}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div className="panel" style={{ maxWidth: wide ? 760 : 520, width: "92%", margin: 16 }} onClick={(e) => e.stopPropagation()}>
        {children}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>🔨 StressForge</h2>
      <p>
        A resilient-architecture &amp; risk simulator. Model a system — software, a company, a country, or a
        planet/habitat — as components, simulate a diverse set of stressors, and watch the incidence matrix, coupling
        (K), and resilience score respond in real time.
      </p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
        StressForge is an original tool. Its method is inspired by publicly available ideas from complexity science and
        architecture/enterprise-risk research — incidence/adjacency matrices, Kauffman-style coupling and criticality
        (NKP), attractors, and stressor simulation. See the open 2020 paper:{" "}
        <a href="https://www.sciencedirect.com/science/article/pii/S1877050920305585" target="_blank" rel="noreferrer">
          “An Introduction to Residuality Theory”, Procedia CS 170 (2020)
        </a>
        . StressForge does not reproduce any material from paid books or workshops.
      </p>
    </Modal>
  );
}

function AuthModal({ onClose, onAuthed }: { onClose: () => void; onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, displayName };
      const r = await api.post<{ token: string }>(path, body);
      onAuthed(r.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{mode === "login" ? "Sign in" : "Create account"}</h2>
      <div className="list">
        {mode === "register" && (
          <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        )}
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          placeholder="Password (min 8)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <div className="err">{err}</div>}
        <button className="primary" onClick={submit}>
          {mode === "login" ? "Sign in" : "Register"}
        </button>
        <div className="muted" style={{ cursor: "pointer" }} onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Social sign-in (Google / X) is available in production deployments.
        </div>
      </div>
    </Modal>
  );
}
