"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Role = "admin" | "coordinacion" | "territorio" | "finanzas" | "consulta";
type Profile = { id: string; full_name: string; role: Role; active: boolean };
type BudgetEntry = {
  id: number;
  kind: "ingreso" | "gasto" | "compromiso";
  category: string;
  description: string;
  amount: number;
  occurred_on: string;
  status: "pendiente" | "confirmado" | "cancelado";
  payment_method: string | null;
};

const modules = [
  { id: "inicio", label: "Inicio", icon: "⌂" },
  { id: "votantes", label: "Votantes", icon: "◎" },
  { id: "sedes", label: "Sedes", icon: "◇" },
  { id: "presupuesto", label: "Presupuesto", icon: "$" },
  { id: "mas", label: "Más", icon: "•••" },
];

const roleLabels: Record<Role, string> = {
  admin: "Administración",
  coordinacion: "Coordinación",
  territorio: "Territorio",
  finanzas: "Finanzas",
  consulta: "Consulta",
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMessage("No pudimos ingresar. Revisá el correo y la contraseña.");
    setBusy(false);
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMessage("Escribí primero tu correo para recuperar el acceso.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setMessage(error ? "No se pudo enviar el correo de recuperación." : "Te enviamos un enlace de recuperación.");
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark">9</div>
        <p>RUMBO AL</p><h1>9 DE MAYO</h1>
        <span>Organización, territorio y resultados.</span>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div className="login-heading">
          <span className="kicker">ACCESO SEGURO AL EQUIPO</span>
          <h2>Bienvenido</h2>
          <p>Ingresá con la cuenta que te asignó la coordinación.</p>
        </div>
        <label>Correo electrónico<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@equipo.com" autoComplete="email" /></label>
        <label>Contraseña<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
        <div className="login-options"><span>Acceso exclusivo para usuarios autorizados</span><button type="button" onClick={resetPassword}>¿Olvidaste tu contraseña?</button></div>
        {message && <p className="form-message" role="status">{message}</p>}
        <button className="primary" disabled={busy}>{busy ? "Verificando..." : "Ingresar a la plataforma"} <span>→</span></button>
        <p className="demo-note secure">● Conexión protegida por Supabase</p>
      </form>
    </main>
  );
}

function Budget({ user, entries, reload }: { user: User; entries: BudgetEntry[]; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const totals = useMemo(() => entries.reduce((acc, item) => {
    if (item.status !== "cancelado") acc[item.kind] += Number(item.amount);
    return acc;
  }, { ingreso: 0, gasto: 0, compromiso: 0 }), [entries]);

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const { error } = await supabase.from("budget_entries").insert({
      kind: data.get("kind"),
      category: data.get("category"),
      description: data.get("description"),
      amount: Number(data.get("amount")),
      occurred_on: data.get("occurred_on"),
      status: data.get("status"),
      payment_method: data.get("payment_method") || null,
      created_by: user.id,
    });
    if (error) {
      setMessage("No se pudo registrar. Verificá tus permisos y los datos.");
    } else {
      event.currentTarget.reset();
      setOpen(false);
      await reload();
    }
    setSaving(false);
  }

  return (
    <section className="budget-view">
      <div className="module-title"><div><p className="kicker">CONTROL FINANCIERO</p><h1>Presupuesto</h1><span>Ingresos, gastos y compromisos con trazabilidad.</span></div><button className="primary compact" onClick={() => setOpen(!open)}>＋ Nuevo movimiento</button></div>
      <div className="budget-summary">
        <article className="money-card income"><p>INGRESOS</p><strong>{money.format(totals.ingreso)}</strong><span>Fondos confirmados</span></article>
        <article className="money-card expense"><p>GASTOS</p><strong>{money.format(totals.gasto)}</strong><span>Pagos realizados</span></article>
        <article className="money-card commitment"><p>COMPROMISOS</p><strong>{money.format(totals.compromiso)}</strong><span>Obligaciones pendientes</span></article>
        <article className="money-card available"><p>DISPONIBLE</p><strong>{money.format(totals.ingreso - totals.gasto - totals.compromiso)}</strong><span>Saldo proyectado</span></article>
      </div>
      {open && <form className="entry-form panel" onSubmit={addEntry}>
        <div className="form-head"><div><p className="kicker">NUEVO REGISTRO</p><h2>Cargar movimiento</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
        <div className="form-grid">
          <label>Tipo<select name="kind" required><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option><option value="compromiso">Compromiso</option></select></label>
          <label>Categoría<select name="category" required><option>Movilidad</option><option>Comunicación</option><option>Logística</option><option>Sedes</option><option>Eventos</option><option>Otros</option></select></label>
          <label className="wide">Descripción<input name="description" required maxLength={180} placeholder="Detalle del movimiento" /></label>
          <label>Monto<input name="amount" required type="number" min="1" step="0.01" placeholder="0,00" /></label>
          <label>Fecha<input name="occurred_on" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <label>Estado<select name="status"><option value="confirmado">Confirmado</option><option value="pendiente">Pendiente</option></select></label>
          <label>Medio de pago<select name="payment_method"><option value="">Sin especificar</option><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Otro</option></select></label>
        </div>
        {message && <p className="form-message">{message}</p>}
        <div className="form-actions"><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary compact" disabled={saving}>{saving ? "Guardando..." : "Guardar movimiento"}</button></div>
      </form>}
      <article className="panel ledger">
        <div className="panel-head"><div><p className="kicker">ÚLTIMOS MOVIMIENTOS</p><h2>Registro financiero</h2></div><span>{entries.length} movimientos</span></div>
        {entries.length === 0 ? <div className="empty-state"><b>Todavía no hay movimientos</b><span>Usá “Nuevo movimiento” para registrar el primero.</span></div> :
          <div className="ledger-list">{entries.map((item) => <div className="ledger-row" key={item.id}><span className={`kind-dot ${item.kind}`} /><div><strong>{item.description}</strong><small>{item.category} · {new Date(`${item.occurred_on}T12:00:00`).toLocaleDateString("es-AR")}</small></div><em className={item.status}>{item.status}</em><b className={item.kind}>{item.kind === "ingreso" ? "+" : "−"} {money.format(Number(item.amount))}</b></div>)}</div>}
      </article>
    </section>
  );
}

function HomeDashboard({ entries, go }: { entries: BudgetEntry[]; go: (id: string) => void }) {
  const totals = entries.reduce((acc, item) => {
    if (item.status !== "cancelado") acc[item.kind] += Number(item.amount);
    return acc;
  }, { ingreso: 0, gasto: 0, compromiso: 0 });
  const available = totals.ingreso - totals.gasto - totals.compromiso;
  const cards = [
    { eyebrow: "BASE TERRITORIAL", value: "0", label: "votantes registrados", trend: "Listo para importar padrón", tone: "blue", icon: "◎" },
    { eyebrow: "ORGANIZACIÓN", value: "0", label: "sedes activas", trend: "Listo para registrar sedes", tone: "green", icon: "◇" },
    { eyebrow: "RECURSOS", value: money.format(available), label: "saldo proyectado", trend: `${entries.length} movimientos registrados`, tone: "amber", icon: "$" },
  ];
  return <>
    <section className="hero-row"><div><p className="kicker">CENTRO DE OPERACIONES</p><h1>Buen día.</h1><span>Este es el pulso del equipo.</span></div><div className="countdown"><span>CUENTA REGRESIVA</span><strong>290</strong><b>DÍAS</b><small>HASTA EL 9 DE MAYO</small></div></section>
    <section className="stats-grid">{cards.map((card) => <article className={`stat-card ${card.tone}`} key={card.eyebrow}><div className="card-icon">{card.icon}</div><p>{card.eyebrow}</p><strong>{card.value}</strong><span>{card.label}</span><small>↗ {card.trend}</small></article>)}</section>
    <section className="content-grid">
      <article className="panel territory"><div className="panel-head"><div><p className="kicker">AVANCE TERRITORIAL</p><h2>Cobertura por zona</h2></div></div><div className="empty-state compact-empty"><b>Esperando padrón electoral</b><span>La estructura está preparada para circuitos, escuelas y responsables.</span></div></article>
      <article className="panel agenda"><div className="panel-head"><div><p className="kicker">PRÓXIMAS ACCIONES</p><h2>Agenda del equipo</h2></div></div><div className="task"><i className="green" /><div><strong>Configurar usuarios iniciales</strong><span>Administración del sistema</span></div><em>En curso</em></div><div className="task"><i className="amber" /><div><strong>Cargar primer presupuesto</strong><span>Finanzas</span></div><em>Pendiente</em></div></article>
    </section>
    <section className="quick-section"><div><p className="kicker">ACCESOS RÁPIDOS</p><h2>¿Qué necesitás hacer?</h2></div><div className="quick-grid"><button onClick={() => go("votantes")}><span>＋</span><b>Agregar votante</b><small>Registrar contacto territorial</small></button><button onClick={() => go("presupuesto")}><span>$</span><b>Registrar movimiento</b><small>Ingreso, gasto o compromiso</small></button><button onClick={() => go("sedes")}><span>◇</span><b>Crear sede</b><small>Organizar presencia territorial</small></button><button><span>!</span><b>Nuevo reclamo</b><small>Próximo módulo de gestión</small></button></div></section>
  </>;
}

function Dashboard({ session, profile }: { session: Session; profile: Profile }) {
  const [active, setActive] = useState("inicio");
  const [notice, setNotice] = useState("");
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const canFinance = ["admin", "coordinacion", "finanzas"].includes(profile.role);

  async function loadBudget() {
    if (!canFinance) return;
    const { data, error } = await supabase.from("budget_entries").select("id,kind,category,description,amount,occurred_on,status,payment_method").order("occurred_on", { ascending: false }).order("id", { ascending: false }).limit(100);
    if (!error) setEntries((data ?? []) as BudgetEntry[]);
  }
  useEffect(() => { void loadBudget(); }, []);

  const go = (id: string) => {
    if (id === "presupuesto" && !canFinance) {
      setNotice("Tu rol no tiene acceso al módulo Presupuesto.");
      return;
    }
    setActive(id);
    if (!["inicio", "presupuesto"].includes(id)) setNotice(`${modules.find((m) => m.id === id)?.label}: próximo módulo a implementar.`);
  };

  const initials = profile.full_name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  return <main className="app-shell">
    <header className="topbar"><div className="identity"><div className="mini-mark">9</div><div><strong>RUMBO AL 9 DE MAYO</strong><span>Centro de operaciones</span></div></div><div className="top-actions"><button aria-label="Notificaciones" className="icon-button">◌<i /></button><button className="profile" onClick={() => void supabase.auth.signOut()} title="Cerrar sesión"><span>{initials}</span><b>{profile.full_name}</b><em>{roleLabels[profile.role]}</em><small>Salir</small></button></div></header>
    <div className="page">{active === "presupuesto" ? <Budget user={session.user} entries={entries} reload={loadBudget} /> : <HomeDashboard entries={entries} go={go} />}</div>
    <nav className="bottom-nav" aria-label="Navegación principal">{modules.map((item) => <button className={active === item.id ? "active" : ""} onClick={() => go(item.id)} key={item.id}><span>{item.icon}</span>{item.label}</button>)}</nav>
    {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
  </main>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setLoading(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    supabase.from("profiles").select("id,full_name,role,active").eq("id", session.user.id).single().then(({ data }) => {
      setProfile(data as Profile | null);
      setLoading(false);
    });
  }, [session]);

  if (loading) return <main className="loading-screen"><div className="brand-mark">9</div><p>Preparando tu espacio seguro...</p></main>;
  if (!session) return <Login />;
  if (!profile || !profile.active) return <main className="access-state"><div className="brand-mark">9</div><h1>Acceso pendiente</h1><p>Tu cuenta existe, pero todavía debe ser habilitada por administración.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;
  return <Dashboard session={session} profile={profile} />;
}
