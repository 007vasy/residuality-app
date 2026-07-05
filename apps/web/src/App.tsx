import { useEffect, useState } from "react";
import { api, getToken, setToken, type Project } from "./api";
import { ProjectView } from "./ProjectView";

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [me, setMe] = useState<{ email: string; displayName: string } | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    api
      .get<{ user: { email: string; displayName: string } }>("/me")
      .then((r) => setMe(r.user))
      .catch(() => {
        setToken(null);
        setAuthed(false);
      });
  }, [authed]);

  if (!authed) return <Auth onAuthed={() => setAuthed(true)} />;

  return (
    <>
      <div className="topbar">
        <h1
          style={{ cursor: "pointer" }}
          onClick={() => setOpenProject(null)}
        >
          🜁 Residuality
        </h1>
        <span className="muted">architecture stress lab</span>
        <div className="spacer" />
        <span className="muted">{me?.email}</span>
        <button
          onClick={() => {
            setToken(null);
            setAuthed(false);
          }}
        >
          Sign out
        </button>
      </div>
      {openProject ? (
        <ProjectView projectId={openProject} onBack={() => setOpenProject(null)} />
      ) : (
        <Projects onOpen={setOpenProject} />
      )}
    </>
  );
}

function Auth({ onAuthed }: { onAuthed: () => void }) {
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
      setToken(r.token);
      onAuthed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="container" style={{ maxWidth: 380, marginTop: 80 }}>
      <div className="panel">
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
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
        </div>
      </div>
    </div>
  );
}

function Projects({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");

  const load = () => api.get<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects));
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    const r = await api.post<{ project: Project }>("/projects", { name });
    setName("");
    onOpen(r.project.id);
  }

  return (
    <div className="container">
      <div className="panel">
        <h2>Your architectures</h2>
        <div className="row">
          <input placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
          <button className="primary" onClick={create}>
            Create
          </button>
        </div>
      </div>
      <div className="grid-cards">
        {projects.map((p) => (
          <div key={p.id} className="card" onClick={() => onOpen(p.id)}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {p.description || "No description"}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="badge">{p.role}</span>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div className="muted">No projects yet — create one to start stress-testing.</div>}
      </div>
    </div>
  );
}
