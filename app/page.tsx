"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Role = "admin" | "coordinacion" | "territorio" | "finanzas" | "consulta";
type Profile = { id: string; full_name: string; role: Role; active: boolean; is_platform_admin: boolean };
type Organization = {
  id: string; name: string; candidate_name: string; position_sought: string | null;
  slug: string; primary_color: string; accent_color: string; active: boolean;
};
type Team = { id: string; organization_id: string; name: string; description: string | null; active: boolean };
type Member = {
  organization_id: string; user_id: string; team_id: string | null; role: Role; active: boolean;
  profiles: { id: string; full_name: string; active: boolean } | null;
};
type Headquarters = {
  id: number; name: string; address: string; circuit: string | null; phone: string | null;
  team_id: string | null; responsible_user_id: string | null; active: boolean;
};
type BudgetEntry = {
  id: number; kind: "ingreso" | "gasto" | "compromiso"; category: string;
  description: string; amount: number; occurred_on: string;
  status: "pendiente" | "confirmado" | "cancelado"; payment_method: string | null;
};

const roleLabels: Record<Role, string> = {
  admin: "Administrador", coordinacion: "Coordinación", territorio: "Territorio",
  finanzas: "Finanzas", consulta: "Consulta",
};
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`logo-lockup ${compact ? "compact" : ""}`}>
    <img src="/rumbo-logo.png" alt="Logo de Rumbo al 9 de Mayo" />
    <div><span>RUMBO AL</span><strong>9 DE MAYO</strong></div>
  </div>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMessage("No pudimos ingresar. Revisá el correo y la contraseña.");
    setBusy(false);
  }

  async function resetPassword() {
    if (!email.trim()) return setMessage("Escribí primero tu correo para recuperar el acceso.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setMessage(error ? "No se pudo enviar el correo." : "Te enviamos un enlace de recuperación.");
    setBusy(false);
  }

  return <main className="login-shell">
    <section className="login-brand">
      <Logo />
      <p className="login-overline">PLATAFORMA DE ORGANIZACIÓN POLÍTICA</p>
      <h1>Territorio, equipos y gestión en un solo lugar.</h1>
      <span>Una herramienta preparada para acompañar campañas de cualquier escala.</span>
    </section>
    <form className="login-card" onSubmit={submit}>
      <div className="login-heading"><span className="kicker">ACCESO SEGURO</span><h2>Bienvenido</h2><p>Ingresá con la cuenta asignada a tu equipo.</p></div>
      <label>Correo electrónico<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@equipo.com" autoComplete="email" /></label>
      <label>Contraseña<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
      <div className="login-options"><span>Usuarios autorizados</span><button type="button" onClick={resetPassword}>¿Olvidaste tu contraseña?</button></div>
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="primary" disabled={busy}>{busy ? "Verificando..." : "Ingresar a la plataforma"} <span>→</span></button>
      <p className="secure-note">● Conexión protegida</p>
    </form>
  </main>;
}

function Budget({ user, organization, entries, reload }: {
  user: User; organization: Organization; entries: BudgetEntry[]; reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const totals = useMemo(() => entries.reduce((acc, item) => {
    if (item.status !== "cancelado") acc[item.kind] += Number(item.amount);
    return acc;
  }, { ingreso: 0, gasto: 0, compromiso: 0 }), [entries]);

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const { error } = await supabase.from("budget_entries").insert({
      organization_id: organization.id, kind: data.get("kind"), category: data.get("category"),
      description: data.get("description"), amount: Number(data.get("amount")),
      occurred_on: data.get("occurred_on"), status: data.get("status"),
      payment_method: data.get("payment_method") || null, created_by: user.id,
    });
    if (error) setMessage("No se pudo registrar. Verificá los datos.");
    else { form.reset(); setOpen(false); await reload(); }
    setSaving(false);
  }

  return <section>
    <ModuleTitle kicker="CONTROL FINANCIERO" title="Presupuesto" subtitle={`Recursos de ${organization.name}.`}>
      <button className="primary compact" onClick={() => setOpen(!open)}>＋ Nuevo movimiento</button>
    </ModuleTitle>
    <div className="budget-summary">
      <MoneyCard label="INGRESOS" value={totals.ingreso} tone="income" />
      <MoneyCard label="GASTOS" value={totals.gasto} tone="expense" />
      <MoneyCard label="COMPROMISOS" value={totals.compromiso} tone="commitment" />
      <MoneyCard label="DISPONIBLE" value={totals.ingreso - totals.gasto - totals.compromiso} tone="available" />
    </div>
    {open && <form className="entry-form panel" onSubmit={addEntry}>
      <div className="form-head"><div><p className="kicker">NUEVO REGISTRO</p><h2>Cargar movimiento</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <div className="form-grid">
        <label>Tipo<select name="kind" required><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option><option value="compromiso">Compromiso</option></select></label>
        <label>Categoría<select name="category" required><option>Movilidad</option><option>Comunicación</option><option>Logística</option><option>Sedes</option><option>Eventos</option><option>Otros</option></select></label>
        <label className="wide">Descripción<input name="description" required maxLength={180} placeholder="Detalle del movimiento" /></label>
        <label>Monto<input name="amount" required type="number" min="1" step="0.01" /></label>
        <label>Fecha<input name="occurred_on" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Estado<select name="status"><option value="confirmado">Confirmado</option><option value="pendiente">Pendiente</option></select></label>
        <label>Medio de pago<select name="payment_method"><option value="">Sin especificar</option><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Otro</option></select></label>
      </div>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions"><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary compact" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div>
    </form>}
    <article className="panel ledger">
      <PanelHead kicker="TRAZABILIDAD" title="Movimientos recientes" aside={`${entries.length} registros`} />
      {entries.length === 0 ? <Empty title="Todavía no hay movimientos" text="Registrá el primer ingreso, gasto o compromiso del equipo." /> :
        <div className="ledger-list">{entries.map((item) => <div className="ledger-row" key={item.id}>
          <i className={`kind-dot ${item.kind}`} /><div><strong>{item.description}</strong><small>{item.category} · {new Date(`${item.occurred_on}T12:00:00`).toLocaleDateString("es-AR")}</small></div>
          <em>{item.status}</em><b className={item.kind}>{item.kind === "ingreso" ? "+" : "−"} {money.format(Number(item.amount))}</b>
        </div>)}</div>}
    </article>
  </section>;
}

function HeadquartersView({ organization, teams, members, items, reload }: {
  organization: Organization; teams: Team[]; members: Member[]; items: Headquarters[]; reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const { error } = await supabase.from("headquarters").insert({
      organization_id: organization.id, name: data.get("name"), address: data.get("address"),
      circuit: data.get("circuit") || null, phone: data.get("phone") || null,
      team_id: data.get("team_id") || null, responsible_user_id: data.get("responsible_user_id") || null,
    });
    if (error) setMessage("No se pudo crear la sede.");
    else { form.reset(); setOpen(false); await reload(); }
  }
  return <section>
    <ModuleTitle kicker="PRESENCIA TERRITORIAL" title="Sedes" subtitle="Cada sede queda vinculada a un equipo y a una persona responsable.">
      <button className="primary compact" onClick={() => setOpen(!open)}>＋ Nueva sede</button>
    </ModuleTitle>
    {open && <form className="entry-form panel" onSubmit={submit}>
      <div className="form-head"><div><p className="kicker">NUEVA SEDE</p><h2>Datos del lugar</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <div className="form-grid">
        <label className="wide">Nombre<input name="name" required placeholder="Sede Barrio Norte" /></label>
        <label className="wide">Dirección<input name="address" required placeholder="Calle y número" /></label>
        <label>Circuito<input name="circuit" placeholder="Opcional" /></label>
        <label>Teléfono<input name="phone" placeholder="Opcional" /></label>
        <label>Equipo<select name="team_id"><option value="">Sin asignar</option>{teams.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
        <label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.map((m) => <option value={m.user_id} key={m.user_id}>{m.profiles?.full_name}</option>)}</select></label>
      </div>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions"><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary compact">Crear sede</button></div>
    </form>}
    {items.length === 0 ? <article className="panel"><Empty title="Todavía no hay sedes" text="Cuando crees una sede vas a poder ver qué equipo trabaja allí y quién es responsable." /></article> :
      <div className="cards-list">{items.map((item) => <article className="panel sede-card" key={item.id}><span className="card-symbol">⌂</span><div><p className="kicker">SEDE ACTIVA</p><h2>{item.name}</h2><span>{item.address}</span><small>{teams.find((t) => t.id === item.team_id)?.name ?? "Sin equipo"} · {members.find((m) => m.user_id === item.responsible_user_id)?.profiles?.full_name ?? "Sin responsable"}</small></div></article>)}</div>}
  </section>;
}

function VotersView() {
  return <section>
    <ModuleTitle kicker="BASE ELECTORAL" title="Votantes" subtitle="Preparado para recibir el padrón oficial cuando la Junta Electoral defina su formato." />
    <article className="panel voter-plan">
      <div className="voter-hero"><span>1M+</span><div><p className="kicker">ESCALA PREVISTA</p><h2>La base no será una simple planilla</h2><p>Vamos a importar el archivo por lotes, validar duplicados y conservar exactamente las columnas originales.</p></div></div>
      <div className="plan-grid">
        <div><b>1</b><strong>Recibir el archivo</strong><span>CSV, Excel o formato entregado por la Junta.</span></div>
        <div><b>2</b><strong>Analizar columnas</strong><span>DNI, circuito, escuela, mesa y demás variables reales.</span></div>
        <div><b>3</b><strong>Importar y validar</strong><span>Proceso masivo, controlado y con informe de errores.</span></div>
      </div>
      <div className="info-banner">No cargaremos datos ficticios ahora. Así evitamos rehacer la base cuando llegue el padrón definitivo.</div>
    </article>
  </section>;
}

function AdminView({ profile, organization, organizations, teams, members, reloadAll, selectOrganization }: {
  profile: Profile; organization: Organization; organizations: Organization[]; teams: Team[]; members: Member[];
  reloadAll: () => Promise<void>; selectOrganization: (id: string) => void;
}) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const { error } = await supabase.from("teams").insert({ organization_id: organization.id, name: data.get("name"), description: data.get("description") || null });
    if (error) setMessage("No se pudo crear el equipo. Revisá que el nombre no esté repetido.");
    else { form.reset(); setTeamOpen(false); await reloadAll(); }
  }

  async function updateMember(userId: string, field: "team_id" | "role", value: string) {
    const { error } = await supabase.from("memberships").update({ [field]: value || null }).eq("organization_id", organization.id).eq("user_id", userId);
    if (error) setMessage("No se pudo actualizar el usuario.");
    else await reloadAll();
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const slug = String(data.get("name")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: org, error } = await supabase.from("organizations").insert({
      name: data.get("name"), candidate_name: data.get("candidate_name"),
      position_sought: data.get("position_sought") || null, slug,
    }).select().single();
    if (error || !org) return setMessage("No se pudo crear el espacio político.");
    const { data: team } = await supabase.from("teams").insert({ organization_id: org.id, name: "Equipo central", description: "Coordinación general" }).select().single();
    await supabase.from("memberships").insert({ organization_id: org.id, user_id: profile.id, team_id: team?.id ?? null, role: "admin" });
    form.reset(); setOrgOpen(false); await reloadAll(); selectOrganization(org.id);
  }

  return <section>
    <ModuleTitle kicker="CONFIGURACIÓN CENTRAL" title="Administración" subtitle="Espacios políticos, equipos, personas y permisos." />
    <div className="admin-summary">
      <article><span>{organizations.length}</span><b>espacios políticos</b></article>
      <article><span>{teams.length}</span><b>equipos en {organization.name}</b></article>
      <article><span>{members.length}</span><b>usuarios asignados</b></article>
    </div>
    {profile.is_platform_admin && <article className="panel admin-section">
      <PanelHead kicker="PLATAFORMA MULTICLIENTE" title="Espacios políticos" aside={<button className="text-button" onClick={() => setOrgOpen(!orgOpen)}>＋ Crear espacio</button>} />
      {orgOpen && <form className="inline-form" onSubmit={createOrganization}>
        <input name="name" required placeholder="Nombre del espacio o campaña" />
        <input name="candidate_name" required placeholder="Nombre del candidato/a" />
        <input name="position_sought" placeholder="Cargo al que se postula" />
        <button className="primary compact">Crear</button>
      </form>}
      <div className="org-list">{organizations.map((org) => <button className={org.id === organization.id ? "selected" : ""} onClick={() => selectOrganization(org.id)} key={org.id}><span>{org.candidate_name.slice(0, 1)}</span><div><strong>{org.name}</strong><small>{org.candidate_name} · {org.position_sought || "Cargo no definido"}</small></div><em>{org.active ? "Activo" : "Pausado"}</em></button>)}</div>
    </article>}
    <div className="admin-grid">
      <article className="panel admin-section">
        <PanelHead kicker="ESTRUCTURA" title="Equipos" aside={<button className="text-button" onClick={() => setTeamOpen(!teamOpen)}>＋ Nuevo</button>} />
        {teamOpen && <form className="stack-form" onSubmit={createTeam}><input name="name" required placeholder="Ej.: Equipo Juan Pérez" /><textarea name="description" placeholder="Función o territorio del equipo" /><button className="primary compact">Crear equipo</button></form>}
        <div className="team-list">{teams.map((team) => <div key={team.id}><span>{team.name.slice(0, 2).toUpperCase()}</span><div><strong>{team.name}</strong><small>{team.description || "Sin descripción"}</small></div><em>{members.filter((m) => m.team_id === team.id).length} personas</em></div>)}</div>
      </article>
      <article className="panel admin-section">
        <PanelHead kicker="PERSONAS Y PERMISOS" title="Usuarios" aside={`${members.length} activos`} />
        <div className="member-list">{members.map((member) => <div key={member.user_id}>
          <span className="avatar">{(member.profiles?.full_name ?? "U").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><strong>{member.profiles?.full_name}</strong><small>Usuario habilitado</small></div>
          <select aria-label="Equipo" value={member.team_id ?? ""} onChange={(e) => updateMember(member.user_id, "team_id", e.target.value)}><option value="">Sin equipo</option>{teams.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select>
          <select aria-label="Rol" value={member.role} onChange={(e) => updateMember(member.user_id, "role", e.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        </div>)}</div>
        <div className="info-banner compact-info">La invitación automática por correo será el próximo paso. Por ahora, las cuentas nuevas se crean de forma controlada en Supabase y aquí se asignan al equipo correspondiente.</div>
      </article>
    </div>
    {message && <button className="toast" onClick={() => setMessage("")}>{message}<span>×</span></button>}
  </section>;
}

function HomeDashboard({ organization, teams, members, headquarters, entries, go }: {
  organization: Organization; teams: Team[]; members: Member[]; headquarters: Headquarters[]; entries: BudgetEntry[]; go: (id: string) => void;
}) {
  const totals = entries.reduce((acc, item) => { if (item.status !== "cancelado") acc[item.kind] += Number(item.amount); return acc; }, { ingreso: 0, gasto: 0, compromiso: 0 });
  const target = new Date();
  const year = target.getMonth() > 4 || (target.getMonth() === 4 && target.getDate() > 9) ? target.getFullYear() + 1 : target.getFullYear();
  const days = Math.max(0, Math.ceil((new Date(year, 4, 9).getTime() - target.getTime()) / 86400000));
  return <>
    <section className="hero-row"><div><p className="kicker">CENTRO DE OPERACIONES</p><h1>{organization.candidate_name}</h1><span>{organization.name} · {organization.position_sought}</span></div><div className="countdown"><span>CUENTA REGRESIVA</span><strong>{days}</strong><b>DÍAS</b><small>HASTA EL 9 DE MAYO</small></div></section>
    <section className="stats-grid">
      <article className="stat-card blue"><div className="card-icon">◎</div><p>ORGANIZACIÓN</p><strong>{teams.length}</strong><span>equipos configurados</span><small>{members.length} personas asignadas</small></article>
      <article className="stat-card green"><div className="card-icon">⌂</div><p>TERRITORIO</p><strong>{headquarters.length}</strong><span>sedes activas</span><small>Vinculadas a equipos y responsables</small></article>
      <article className="stat-card amber"><div className="card-icon">$</div><p>RECURSOS</p><strong>{money.format(totals.ingreso - totals.gasto - totals.compromiso)}</strong><span>saldo proyectado</span><small>{entries.length} movimientos registrados</small></article>
    </section>
    <section className="content-grid">
      <article className="panel territory"><PanelHead kicker="ESTRUCTURA DE CAMPAÑA" title="Equipos activos" aside={`${teams.length} equipos`} />{teams.length ? <div className="team-overview">{teams.slice(0, 4).map((team) => <div key={team.id}><span>{team.name.slice(0, 1)}</span><div><strong>{team.name}</strong><small>{members.filter((m) => m.team_id === team.id).length} integrantes</small></div></div>)}</div> : <Empty title="Sin equipos" text="Creá el primero desde Administración." />}</article>
      <article className="panel agenda"><PanelHead kicker="SIGUIENTES PASOS" title="Ruta de implementación" /><div className="task"><i className="green" /><div><strong>Base multi-equipo</strong><span>Usuarios, organizaciones y permisos</span></div><em>Lista</em></div><div className="task"><i className="amber" /><div><strong>Completar sedes</strong><span>Responsables y cobertura territorial</span></div><em>En curso</em></div><div className="task"><i className="blue" /><div><strong>Esperar padrón</strong><span>Importación masiva de votantes</span></div><em>Planificado</em></div></article>
    </section>
    <section className="quick-section"><div><p className="kicker">ACCESOS RÁPIDOS</p><h2>¿Qué necesitás hacer?</h2></div><div className="quick-grid">
      <button onClick={() => go("admin")}><span>⚙</span><b>Configurar equipos</b><small>Personas, roles y espacios</small></button>
      <button onClick={() => go("sedes")}><span>⌂</span><b>Crear sede</b><small>Asignar equipo y responsable</small></button>
      <button onClick={() => go("presupuesto")}><span>$</span><b>Registrar movimiento</b><small>Ingreso, gasto o compromiso</small></button>
      <button onClick={() => go("votantes")}><span>◎</span><b>Preparar padrón</b><small>Ver plan de importación</small></button>
    </div></section>
  </>;
}

function ModuleTitle({ kicker, title, subtitle, children }: { kicker: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return <div className="module-title"><div><p className="kicker">{kicker}</p><h1>{title}</h1><span>{subtitle}</span></div>{children}</div>;
}
function PanelHead({ kicker, title, aside }: { kicker: string; title: string; aside?: React.ReactNode }) {
  return <div className="panel-head"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div>{aside && <span>{aside}</span>}</div>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><b>{title}</b><span>{text}</span></div>; }
function MoneyCard({ label, value, tone }: { label: string; value: number; tone: string }) { return <article className={`money-card ${tone}`}><p>{label}</p><strong>{money.format(value)}</strong><span>Valores del espacio seleccionado</span></article>; }

function Dashboard({ session, profile }: { session: Session; profile: Profile }) {
  const [active, setActive] = useState("inicio");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [headquarters, setHeadquarters] = useState<Headquarters[]>([]);
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [notice, setNotice] = useState("");
  const organization = organizations.find((org) => org.id === organizationId) ?? organizations[0];
  const membership = members.find((member) => member.user_id === profile.id);
  const orgRole: Role = membership?.role ?? (profile.is_platform_admin ? "admin" : profile.role);
  const canFinance = profile.is_platform_admin || ["admin", "coordinacion", "finanzas"].includes(orgRole);
  const canAdmin = profile.is_platform_admin || orgRole === "admin";

  const loadOrganizations = useCallback(async () => {
    const { data } = await supabase.from("organizations").select("*").eq("active", true).order("name");
    const list = (data ?? []) as Organization[]; setOrganizations(list);
    setOrganizationId((current) => current && list.some((org) => org.id === current) ? current : list[0]?.id ?? "");
  }, []);
  const loadContext = useCallback(async () => {
    if (!organizationId) return;
    const [teamResult, memberResult, sedeResult, budgetResult] = await Promise.all([
      supabase.from("teams").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
      supabase.from("memberships").select("organization_id,user_id,team_id,role,active,profiles(id,full_name,active)").eq("organization_id", organizationId).eq("active", true),
      supabase.from("headquarters").select("id,name,address,circuit,phone,team_id,responsible_user_id,active").eq("organization_id", organizationId).eq("active", true).order("name"),
      supabase.from("budget_entries").select("id,kind,category,description,amount,occurred_on,status,payment_method").eq("organization_id", organizationId).order("occurred_on", { ascending: false }).limit(100),
    ]);
    setTeams((teamResult.data ?? []) as Team[]);
    setMembers((memberResult.data ?? []) as unknown as Member[]);
    setHeadquarters((sedeResult.data ?? []) as Headquarters[]);
    setEntries(budgetResult.error ? [] : (budgetResult.data ?? []) as BudgetEntry[]);
  }, [organizationId]);
  useEffect(() => { void loadOrganizations(); }, [loadOrganizations]);
  useEffect(() => { void loadContext(); }, [loadContext]);

  async function reloadAll() { await loadOrganizations(); await loadContext(); }
  const modules = [
    { id: "inicio", label: "Inicio", icon: "⌂" }, { id: "votantes", label: "Votantes", icon: "◎" },
    { id: "sedes", label: "Sedes", icon: "◇" }, { id: "presupuesto", label: "Presupuesto", icon: "$" },
    ...(canAdmin ? [{ id: "admin", label: "Administración", icon: "⚙" }] : []),
  ];
  function go(id: string) {
    if (id === "presupuesto" && !canFinance) return setNotice("Tu rol no tiene acceso al presupuesto.");
    if (id === "admin" && !canAdmin) return setNotice("Tu rol no tiene acceso a Administración.");
    setActive(id);
  }
  if (!organization) return <main className="access-state"><Logo /><h1>Sin espacio asignado</h1><p>Tu cuenta está activa, pero aún no pertenece a una organización política.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;

  const initials = profile.full_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <main className="app-shell">
    <header className="topbar">
      <Logo compact />
      <div className="organization-switch"><span>ESPACIO ACTIVO</span><select value={organization.id} onChange={(e) => setOrganizationId(e.target.value)}>{organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select></div>
      <button className="profile" onClick={() => void supabase.auth.signOut()} title="Cerrar sesión"><span>{initials}</span><b>{profile.full_name}</b><em>{roleLabels[orgRole]}</em><small>Salir</small></button>
    </header>
    <div className="page">
      {active === "inicio" && <HomeDashboard organization={organization} teams={teams} members={members} headquarters={headquarters} entries={entries} go={go} />}
      {active === "votantes" && <VotersView />}
      {active === "sedes" && <HeadquartersView organization={organization} teams={teams} members={members} items={headquarters} reload={loadContext} />}
      {active === "presupuesto" && <Budget user={session.user} organization={organization} entries={entries} reload={loadContext} />}
      {active === "admin" && <AdminView profile={profile} organization={organization} organizations={organizations} teams={teams} members={members} reloadAll={reloadAll} selectOrganization={setOrganizationId} />}
    </div>
    <nav className="bottom-nav" aria-label="Navegación principal">{modules.map((item) => <button className={active === item.id ? "active" : ""} onClick={() => go(item.id)} key={item.id}><span>{item.icon}</span>{item.label}</button>)}</nav>
    {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
  </main>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (!next) { setProfile(null); setLoading(false); } });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return; setLoading(true);
    supabase.from("profiles").select("id,full_name,role,active,is_platform_admin").eq("id", session.user.id).single().then(({ data }) => { setProfile(data as Profile | null); setLoading(false); });
  }, [session]);
  if (loading) return <main className="loading-screen"><Logo /><p>Preparando tu espacio de trabajo...</p></main>;
  if (!session) return <Login />;
  if (!profile || !profile.active) return <main className="access-state"><Logo /><h1>Acceso pendiente</h1><p>La cuenta debe ser habilitada por Administración.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;
  return <Dashboard session={session} profile={profile} />;
}
