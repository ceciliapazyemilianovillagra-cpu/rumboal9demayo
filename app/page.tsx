"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { TerritoryMap, type MapPoint } from "./territory-map";

type Role = "admin" | "coordinacion" | "territorio" | "finanzas" | "consulta";
type Profile = { id: string; full_name: string; role: Role; active: boolean; is_platform_admin: boolean };
type Organization = {
  id: string; name: string; candidate_name: string; position_sought: string | null;
  slug: string; primary_color: string; accent_color: string; active: boolean;
  logo_url?:string|null; plan_name?:string; license_status?:string; license_expires_at?:string|null;
};
type Team = { id: string; organization_id: string; name: string; description: string | null; active: boolean };
type Member = {
  organization_id: string; user_id: string; team_id: string | null; role: Role; active: boolean; allowed_modules:string[]|null;
  profiles: { id: string; full_name: string; active: boolean } | null;
};
type Headquarters = {
  id: number; name: string; address: string; circuit: string | null; phone: string | null;
  team_id: string | null; responsible_user_id: string | null; active: boolean; latitude:number|null; longitude:number|null;
};
type BudgetEntry = {
  id: number; kind: "ingreso" | "gasto" | "compromiso"; category: string;
  description: string; amount: number; occurred_on: string;
  status: "pendiente" | "confirmado" | "cancelado"; payment_method: string | null;
};
type Claim = { id:number; title:string; description:string; neighbor_name:string|null; neighbor_phone:string|null; address:string; neighborhood:string|null; category:string; priority:"baja"|"media"|"alta"|"urgente"; status:"nuevo"|"en_revision"|"asignado"|"en_proceso"|"resuelto"|"cerrado"; headquarters_id:number|null; team_id:string|null; responsible_user_id:string|null; created_at:string; latitude:number|null; longitude:number|null };
type Project = { id:number; name:string; objective:string; status:string; priority:string; responsible_user_id:string|null; team_id:string|null; source_claim_id:number|null; start_date:string|null; due_date:string|null; estimated_budget:number };
type Proposal = { id:number; title:string; theme:string; diagnosis:string; solution:string; beneficiaries:string|null; status:string; responsible_user_id:string|null; source_claim_id:number|null; project_id:number|null };
type Activity = { id:number; title:string; activity_type:string; description:string|null; starts_at:string; ends_at:string|null; location:string|null; headquarters_id:number|null; team_id:string|null; responsible_user_id:string|null; status:string };
type Referent = { id:number; full_name:string; phone:string|null; email:string|null; referent_type:string; neighborhood:string|null; circuit:string|null; zone:string|null; headquarters_id:number|null; team_id:string|null; reports_to_user_id:string|null; influence_level:string; status:string; notes:string|null; latitude:number|null; longitude:number|null };
type VoterImport = { id:string; file_name:string; file_size:number|null; source_format:string; status:string; detected_columns:string[]; total_rows:number; processed_rows:number; error_rows:number; created_at:string };
type AuditItem = { id:number; entity_type:string; entity_id:string; action:string; details:Record<string,unknown>; created_at:string; actor_id:string|null };
const configurableModules=[["votantes","Votantes"],["sedes","Sedes"],["presupuesto","Presupuesto"],["gestion","Reclamos y proyectos"],["agenda","Agenda"],["propuestas","Propuestas"],["territorio","Territorio y referentes"]] as const;

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

function LocationInputs() {
  const [coordinates,setCoordinates]=useState({latitude:"",longitude:""});
  const [message,setMessage]=useState("");
  function locate(){
    if(!navigator.geolocation)return setMessage("Este dispositivo no permite obtener la ubicación.");
    setMessage("Buscando ubicación...");
    navigator.geolocation.getCurrentPosition(
      position=>{setCoordinates({latitude:position.coords.latitude.toFixed(7),longitude:position.coords.longitude.toFixed(7)});setMessage("Ubicación agregada.");},
      ()=>setMessage("No se pudo obtener la ubicación. Podés continuar sin mapa."),
      {enableHighAccuracy:true,timeout:12000}
    );
  }
  return <div className="location-fields"><input type="hidden" name="latitude" value={coordinates.latitude}/><input type="hidden" name="longitude" value={coordinates.longitude}/><button type="button" onClick={locate}>⌖ Usar ubicación actual</button>{message&&<small>{message}</small>}</div>;
}

function PdfButton({organization,title,columns,rows}:{organization:Organization;title:string;columns:string[];rows:string[][]}){
  const [busy,setBusy]=useState(false);
  async function download(){
    setBusy(true);
    const {jsPDF}=await import("jspdf");
    const pdf=new jsPDF({unit:"mm",format:"a4"}),width=210,height=297,margin=16;
    const generated=new Date().toLocaleString("es-AR");
    let y=30;
    const footer=()=>{pdf.setFontSize(8);pdf.setTextColor(100);pdf.text(`Rumbo al 9 de Mayo · ${organization.name}`,margin,height-9);pdf.text(`Generado ${generated} · Página ${pdf.getNumberOfPages()}`,width-margin,height-9,{align:"right"});};
    const header=()=>{pdf.setFillColor(organization.primary_color);pdf.rect(0,0,width,20,"F");pdf.setTextColor(255);pdf.setFontSize(15);pdf.text("RUMBO AL 9 DE MAYO",margin,9);pdf.setFontSize(9);pdf.text(`${organization.candidate_name} · ${organization.position_sought||organization.name}`,margin,15);pdf.setTextColor(30);pdf.setFontSize(16);pdf.text(title,margin,28);y=37;};
    header();
    rows.forEach((row,index)=>{
      const line=`${index+1}. ${row.map((value,i)=>`${columns[i]}: ${value||"-"}`).join("  ·  ")}`;
      const lines=pdf.splitTextToSize(line,width-margin*2);
      if(y+lines.length*5>height-18){footer();pdf.addPage();header();}
      pdf.setFontSize(9);pdf.setTextColor(35);pdf.text(lines,margin,y);y+=lines.length*5+3;
    });
    if(!rows.length){pdf.setFontSize(10);pdf.text("No hay registros para este informe.",margin,y);}
    footer();pdf.save(`${title.toLowerCase().replace(/[^a-z0-9]+/gi,"-")}.pdf`);setBusy(false);
  }
  return <button className="pdf-button" onClick={download} disabled={busy}>{busy?"Preparando...":"↓ Exportar PDF"}</button>;
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
      <div className="module-actions"><PdfButton organization={organization} title="Informe de presupuesto" columns={["Fecha","Tipo","Categoría","Descripción","Monto","Estado"]} rows={entries.map(item=>[new Date(`${item.occurred_on}T12:00:00`).toLocaleDateString("es-AR"),item.kind,item.category,item.description,money.format(Number(item.amount)),item.status])}/><button className="primary compact" onClick={() => setOpen(!open)}>＋ Nuevo movimiento</button></div>
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
      latitude:data.get("latitude")||null,longitude:data.get("longitude")||null,
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
        <LocationInputs/>
      </div>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions"><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary compact">Crear sede</button></div>
    </form>}
    {items.length === 0 ? <article className="panel"><Empty title="Todavía no hay sedes" text="Cuando crees una sede vas a poder ver qué equipo trabaja allí y quién es responsable." /></article> :
      <div className="cards-list">{items.map((item) => <article className="panel sede-card" key={item.id}><span className="card-symbol">⌂</span><div><p className="kicker">SEDE ACTIVA</p><h2>{item.name}</h2><span>{item.address}</span><small>{teams.find((t) => t.id === item.team_id)?.name ?? "Sin equipo"} · {members.find((m) => m.user_id === item.responsible_user_id)?.profiles?.full_name ?? "Sin responsable"}</small></div></article>)}</div>}
  </section>;
}

function VotersPlan() {
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

function VotersView({user,organization,items,reload}:{user:User;organization:Organization;items:VoterImport[];reload:()=>Promise<void>}) {
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function prepareImport(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const form=event.currentTarget,file=new FormData(form).get("padron") as File;
    const extension=file.name.split(".").pop()?.toLowerCase();
    let columns:string[]=[];
    if(extension==="csv"){
      const firstLine=(await file.slice(0,65536).text()).replace(/^\uFEFF/,"").split(/\r?\n/)[0]||"";
      const separator=firstLine.includes(";")?";":",";
      columns=firstLine.split(separator).map(x=>x.trim().replace(/^['"]|['"]$/g,"")).filter(Boolean);
    }
    const {error}=await supabase.from("voter_imports").insert({
      organization_id:organization.id,file_name:file.name,file_size:file.size,
      source_format:extension==="csv"?"csv":extension==="xlsx"?"xlsx":"other",
      detected_columns:columns,status:columns.length?"mapeo":"analisis",created_by:user.id,
      notes:"Archivo registrado para análisis seguro. El contenido no se envió desde el navegador."
    });
    if(error)setMessage("No se pudo preparar la importación.");
    else{form.reset();setMessage(columns.length?`Archivo analizado: ${columns.length} columnas detectadas.`:"Archivo registrado para análisis.");await reload();}
    setBusy(false);
  }
  return <section>
    <ModuleTitle kicker="BASE ELECTORAL" title="Votantes" subtitle="Importación controlada y preparada para padrones de más de un millón de registros." />
    <article className="panel voter-plan">
      <div className="voter-hero"><span>1M+</span><div><p className="kicker">ESCALA PREVISTA</p><h2>Preparación segura del padrón</h2><p>Detecta columnas, registra el formato y deja listo el mapeo sin exponer información sensible.</p></div></div>
      <div className="plan-grid"><div><b>1</b><strong>Analizar</strong><span>CSV o Excel entregado por la Junta.</span></div><div><b>2</b><strong>Mapear</strong><span>DNI, circuito, escuela, mesa y variables reales.</span></div><div><b>3</b><strong>Importar</strong><span>Por lotes, con duplicados y reporte de errores.</span></div></div>
      <form className="voter-import-form" onSubmit={prepareImport}><div><strong>Preparar un padrón</strong><span>Analiza encabezados y formato sin subir datos sensibles todavía.</span></div><input name="padron" type="file" accept=".csv,.xlsx" required/><button className="primary compact" disabled={busy}>{busy?"Analizando...":"Analizar archivo"}</button></form>
      {message&&<div className="info-banner">{message}</div>}
    </article>
    <article className="panel"><PanelHead kicker="IMPORTACIONES" title="Historial de preparación" aside={`${items.length} archivos`}/>{items.length===0?<Empty title="Sin archivos analizados" text="Cuando llegue una muestra real del padrón, analizala desde el botón superior."/>:<div className="import-list">{items.map(item=><div key={item.id}><span>CSV</span><div><strong>{item.file_name}</strong><small>{item.detected_columns?.length||0} columnas · {item.status} · {new Date(item.created_at).toLocaleDateString("es-AR")}</small></div><b>{item.processed_rows}/{item.total_rows}</b></div>)}</div>}</article>
  </section>;
}

function ManagementView({ user, organization, teams, members, headquarters, claims, projects, reload }: { user:User; organization:Organization; teams:Team[]; members:Member[]; headquarters:Headquarters[]; claims:Claim[]; projects:Project[]; reload:()=>Promise<void> }) {
  const [open,setOpen]=useState(false); const [projectOpen,setProjectOpen]=useState(false); const [message,setMessage]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("claims").insert({organization_id:organization.id,title:data.get("title"),description:data.get("description"),neighbor_name:data.get("neighbor_name")||null,neighbor_phone:data.get("neighbor_phone")||null,address:data.get("address"),neighborhood:data.get("neighborhood")||null,category:data.get("category"),priority:data.get("priority"),headquarters_id:data.get("headquarters_id")||null,team_id:data.get("team_id")||null,responsible_user_id:data.get("responsible_user_id")||null,latitude:data.get("latitude")||null,longitude:data.get("longitude")||null,created_by:user.id});if(error)setMessage("No se pudo registrar el reclamo.");else{form.reset();setOpen(false);await reload();}}
  async function changeStatus(id:number,status:string){const {error}=await supabase.from("claims").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)setMessage("No se pudo actualizar el estado.");else await reload();}
  async function addProject(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("projects").insert({organization_id:organization.id,name:data.get("name"),objective:data.get("objective"),priority:data.get("priority"),team_id:data.get("team_id")||null,responsible_user_id:data.get("responsible_user_id")||null,source_claim_id:data.get("source_claim_id")||null,start_date:data.get("start_date")||null,due_date:data.get("due_date")||null,estimated_budget:Number(data.get("estimated_budget")||0),created_by:user.id});if(error)setMessage("No se pudo crear el proyecto.");else{form.reset();setProjectOpen(false);await reload();}}
  return <section>
    <ModuleTitle kicker="GESTIÓN TERRITORIAL" title="Reclamos vecinales" subtitle="Registro, asignación y seguimiento hasta su resolución."><button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nuevo reclamo</button></ModuleTitle>
    <div className="claim-summary"><article><b>{claims.length}</b><span>Total</span></article><article><b>{claims.filter(c=>!["resuelto","cerrado"].includes(c.status)).length}</b><span>Pendientes</span></article><article><b>{claims.filter(c=>c.priority==="urgente").length}</b><span>Urgentes</span></article><article><b>{claims.filter(c=>c.status==="resuelto").length}</b><span>Resueltos</span></article></div>
    {open&&<form className="entry-form panel" onSubmit={submit}><div className="form-head"><div><p className="kicker">NUEVO RECLAMO</p><h2>Datos del pedido vecinal</h2></div><button type="button" onClick={()=>setOpen(false)}>×</button></div><div className="form-grid">
      <label className="wide">Título<input name="title" required placeholder="Ej.: Falta de iluminación"/></label><label>Categoría<select name="category"><option>Alumbrado</option><option>Calles</option><option>Seguridad</option><option>Salud</option><option>Agua</option><option>Limpieza</option><option>Otro</option></select></label><label>Prioridad<select name="priority"><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
      <label className="wide">Descripción<textarea name="description" required placeholder="Detalle del problema"/></label><label className="wide">Dirección<input name="address" required placeholder="Calle, número y referencias"/></label><label>Barrio<input name="neighborhood"/></label><label>Vecino/a<input name="neighbor_name"/></label><label>Teléfono<input name="neighbor_phone"/></label>
      <label>Sede<select name="headquarters_id"><option value="">Sin asignar</option>{headquarters.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Equipo<select name="team_id"><option value="">Sin asignar</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label>
      <LocationInputs/>
    </div>{message&&<p className="form-message">{message}</p>}<div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Registrar reclamo</button></div></form>}
    <article className="panel"><PanelHead kicker="BANDEJA DE SEGUIMIENTO" title="Reclamos registrados" aside={<PdfButton organization={organization} title="Informe de reclamos" columns={["Reclamo","Barrio o dirección","Prioridad","Estado"]} rows={claims.map(c=>[c.title,c.neighborhood||c.address,c.priority,c.status])}/>}/>{claims.length===0?<Empty title="Todavía no hay reclamos" text="Registrá el primer pedido vecinal para comenzar su seguimiento."/>:<div className="claim-list">{claims.map(c=><div className="claim-row" key={c.id}><span className={`priority ${c.priority}`}>!</span><div><strong>{c.title}</strong><small>{c.category} · {c.neighborhood||c.address}</small></div><em>{c.priority}</em>{c.neighbor_phone&&<a className="whatsapp-button" target="_blank" rel="noreferrer" href={`https://wa.me/${c.neighbor_phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.neighbor_name||""}, te escribimos desde el equipo de ${organization.candidate_name} para continuar el seguimiento de tu reclamo: ${c.title}.`)}`}>WhatsApp</a>}<select value={c.status} onChange={e=>changeStatus(c.id,e.target.value)}><option value="nuevo">Nuevo</option><option value="en_revision">En revisión</option><option value="asignado">Asignado</option><option value="en_proceso">En proceso</option><option value="resuelto">Resuelto</option><option value="cerrado">Cerrado</option></select></div>)}</div>}</article>
    <article className="panel project-panel"><PanelHead kicker="PLANIFICACIÓN" title="Proyectos" aside={<button className="text-button" onClick={()=>setProjectOpen(!projectOpen)}>＋ Nuevo proyecto</button>}/>
      {projectOpen&&<form className="entry-form" onSubmit={addProject}><div className="form-grid"><label className="wide">Nombre<input name="name" required/></label><label className="wide">Objetivo<textarea name="objective" required/></label><label>Prioridad<select name="priority"><option>baja</option><option defaultValue="media">media</option><option>alta</option></select></label><label>Equipo<select name="team_id"><option value="">Sin asignar</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label><label>Reclamo origen<select name="source_claim_id"><option value="">Sin reclamo</option>{claims.map(c=><option key={c.id} value={c.id}>#{c.id} {c.title}</option>)}</select></label><label>Inicio<input type="date" name="start_date"/></label><label>Vencimiento<input type="date" name="due_date"/></label><label>Presupuesto estimado<input type="number" min="0" name="estimated_budget"/></label></div><div className="form-actions"><button type="button" onClick={()=>setProjectOpen(false)}>Cancelar</button><button className="primary compact">Crear proyecto</button></div></form>}
      {projects.length===0?<Empty title="Todavía no hay proyectos" text="Podés crear uno directamente o vincularlo con un reclamo vecinal."/>:<div className="project-list">{projects.map(p=><div key={p.id}><span>✓</span><div><strong>{p.name}</strong><small>{p.status} · {p.due_date?`vence ${new Date(`${p.due_date}T12:00:00`).toLocaleDateString("es-AR")}`:"sin vencimiento"}</small></div><b>{money.format(Number(p.estimated_budget))}</b></div>)}</div>}
    </article>
    {message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}
  </section>;
}

function ProposalsView({user,organization,members,claims,projects,items,reload}:{user:User;organization:Organization;members:Member[];claims:Claim[];projects:Project[];items:Proposal[];reload:()=>Promise<void>}){
  const [open,setOpen]=useState(false);const [message,setMessage]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("proposals").insert({organization_id:organization.id,title:data.get("title"),theme:data.get("theme"),diagnosis:data.get("diagnosis"),solution:data.get("solution"),beneficiaries:data.get("beneficiaries")||null,responsible_user_id:data.get("responsible_user_id")||null,source_claim_id:data.get("source_claim_id")||null,project_id:data.get("project_id")||null,created_by:user.id});if(error)setMessage("No se pudo guardar la propuesta.");else{form.reset();setOpen(false);await reload();}}
  async function changeStatus(id:number,status:string){const {error}=await supabase.from("proposals").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)setMessage("No se pudo actualizar la propuesta.");else await reload();}
  return <section><ModuleTitle kicker="AGENDA POLÍTICA" title="Propuestas" subtitle="De la escucha territorial a iniciativas claras y trazables."><button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nueva propuesta</button></ModuleTitle>
  {open&&<form className="entry-form panel" onSubmit={submit}><div className="form-head"><div><p className="kicker">NUEVA INICIATIVA</p><h2>Construir propuesta</h2></div><button type="button" onClick={()=>setOpen(false)}>×</button></div><div className="form-grid"><label className="wide">Título<input name="title" required/></label><label>Tema<select name="theme"><option>Seguridad</option><option>Salud</option><option>Educación</option><option>Empleo</option><option>Infraestructura</option><option>Ambiente</option><option>Otro</option></select></label><label>Beneficiarios<input name="beneficiaries" placeholder="Barrio, sector o población"/></label><label className="wide">Diagnóstico<textarea name="diagnosis" required placeholder="¿Cuál es el problema?"/></label><label className="wide">Solución propuesta<textarea name="solution" required placeholder="¿Qué se propone hacer?"/></label><label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label><label>Reclamo origen<select name="source_claim_id"><option value="">Sin reclamo</option>{claims.map(c=><option key={c.id} value={c.id}>#{c.id} {c.title}</option>)}</select></label><label>Proyecto relacionado<select name="project_id"><option value="">Sin proyecto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Guardar propuesta</button></div></form>}
  <article className="panel"><PanelHead kicker="BANCO DE PROPUESTAS" title="Iniciativas del espacio" aside={`${items.length} propuestas`}/>{items.length===0?<Empty title="Todavía no hay propuestas" text="Creá la primera iniciativa a partir de un problema territorial."/>:<div className="proposal-list">{items.map(p=><div key={p.id}><span>◆</span><div><strong>{p.title}</strong><small>{p.theme} · {p.beneficiaries||"Alcance a definir"}</small></div><select value={p.status} onChange={e=>changeStatus(p.id,e.target.value)}><option value="borrador">Borrador</option><option value="en_revision">En revisión</option><option value="aprobada">Aprobada</option><option value="publicada">Publicada</option><option value="archivada">Archivada</option></select></div>)}</div>}</article>{message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}</section>;
}

function AdminView({ profile, organization, organizations, teams, members, auditItems, reloadAll, selectOrganization }: {
  profile: Profile; organization: Organization; organizations: Organization[]; teams: Team[]; members: Member[];
  auditItems:AuditItem[];
  reloadAll: () => Promise<void>; selectOrganization: (id: string) => void;
}) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
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
  async function toggleModule(member:Member,moduleId:string){
    const defaults=member.role==="coordinacion"?configurableModules.map(([id])=>id):member.role==="territorio"?["sedes","gestion","agenda","propuestas","territorio"]:member.role==="finanzas"?["presupuesto","agenda"]:["agenda"];
    const current=member.allowed_modules??defaults;
    const next=current.includes(moduleId)?current.filter(id=>id!==moduleId):[...current,moduleId];
    const {error}=await supabase.from("memberships").update({allowed_modules:next}).eq("organization_id",organization.id).eq("user_id",member.user_id);
    if(error)setMessage("No se pudieron actualizar los permisos.");else await reloadAll();
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setInviting(true); setMessage("");
    const { data: result, error } = await supabase.functions.invoke("invite-team-member", {
      body: {
        organization_id: organization.id,
        full_name: data.get("full_name"),
        email: data.get("email"),
        team_id: data.get("team_id") || null,
        role: data.get("role"),
      },
    });
    if (error || result?.error) setMessage(result?.error || "No se pudo enviar la invitación.");
    else {
      setMessage(result.status === "existing" ? "Usuario existente agregado al equipo." : "Invitación enviada correctamente.");
      form.reset();
      setInviteOpen(false);
      await reloadAll();
    }
    setInviting(false);
  }

  async function toggleMember(member: Member) {
    if (member.user_id === profile.id) return setMessage("No podés desactivar tu propio acceso.");
    const { error } = await supabase.from("memberships").update({ active: !member.active })
      .eq("organization_id", organization.id).eq("user_id", member.user_id);
    if (error) setMessage("No se pudo cambiar el estado del usuario.");
    else await reloadAll();
  }

  async function removeMember(member: Member) {
    if (member.user_id === profile.id) return setMessage("No podés borrar tu propio acceso.");
    if (!window.confirm(`¿Borrar a ${member.profiles?.full_name || "este usuario"}?`)) return;
    const { data, error } = await supabase.functions.invoke("invite-team-member", { body: { action: "remove", organization_id: organization.id, user_id: member.user_id } });
    setMessage(error || data?.error ? (data?.error || "No se pudo borrar el usuario.") : "Usuario eliminado correctamente.");
    if (!error && !data?.error) await reloadAll();
  }

  async function bulkInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setInviting(true);
    const file = new FormData(event.currentTarget).get("csv") as File;
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const separator = lines[0]?.includes(";") ? ";" : ",";
    let success = 0; let failed = 0;
    for (const line of lines.slice(1, 101)) {
      const [full_name, email, teamName, roleName] = line.split(separator).map((v) => v.trim());
      const team = teams.find((t) => t.name.toLowerCase() === (teamName || "").toLowerCase());
      const role = Object.keys(roleLabels).includes(roleName) ? roleName : "territorio";
      const { data, error } = await supabase.functions.invoke("invite-team-member", { body: { organization_id: organization.id, full_name, email, team_id: team?.id || null, role } });
      if (error || data?.error) failed++; else success++;
    }
    setMessage(`Carga finalizada: ${success} procesados${failed ? ` y ${failed} con error` : ""}.`);
    setInviting(false); setBulkOpen(false); await reloadAll();
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
  async function saveBrand(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const {error}=await supabase.from("organizations").update({
      candidate_name:data.get("candidate_name"),position_sought:data.get("position_sought")||null,
      primary_color:data.get("primary_color"),accent_color:data.get("accent_color"),
      plan_name:profile.is_platform_admin?data.get("plan_name"):organization.plan_name,
      license_status:profile.is_platform_admin?data.get("license_status"):organization.license_status
    }).eq("id",organization.id);
    setMessage(error?"No se pudo guardar la personalización.":"Personalización guardada.");if(!error)await reloadAll();
  }

  return <section>
    <ModuleTitle kicker="CONFIGURACIÓN CENTRAL" title="Administración" subtitle="Espacios políticos, equipos, personas y permisos." />
    <div className="admin-summary">
      <article><span>{organizations.length}</span><b>espacios políticos</b></article>
      <article><span>{teams.length}</span><b>equipos en {organization.name}</b></article>
      <article><span>{members.length}</span><b>usuarios asignados</b></article>
    </div>
    <article className="panel admin-section"><PanelHead kicker="MARCA Y LICENCIA" title="Personalización del espacio"/><form className="brand-form" onSubmit={saveBrand}><label>Candidato/a<input name="candidate_name" defaultValue={organization.candidate_name} required/></label><label>Cargo<input name="position_sought" defaultValue={organization.position_sought||""}/></label><label>Color principal<input name="primary_color" type="color" defaultValue={organization.primary_color}/></label><label>Color de acento<input name="accent_color" type="color" defaultValue={organization.accent_color}/></label>{profile.is_platform_admin&&<><label>Plan<select name="plan_name" defaultValue={organization.plan_name||"base"}><option value="base">Base</option><option value="profesional">Profesional</option><option value="campaña">Campaña</option></select></label><label>Licencia<select name="license_status" defaultValue={organization.license_status||"active"}><option value="trial">Prueba</option><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="expired">Vencida</option></select></label></>}<button className="primary compact">Guardar configuración</button></form></article>
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
        <PanelHead kicker="PERSONAS Y PERMISOS" title="Usuarios" aside={<div className="user-tools"><button className="text-button" onClick={() => setBulkOpen(!bulkOpen)}>⇧ Carga masiva</button><button className="text-button" onClick={() => setInviteOpen(!inviteOpen)}>＋ Invitar usuario</button></div>} />
        {bulkOpen && <form className="bulk-form" onSubmit={bulkInvite}><div><strong>Cargar CSV</strong><small>nombre; email; equipo; rol (máximo 100)</small></div><input name="csv" type="file" accept=".csv,text/csv" required /><button className="primary compact" disabled={inviting}>{inviting ? "Procesando..." : "Cargar"}</button></form>}
        {inviteOpen && <form className="invite-form" onSubmit={inviteMember}>
          <div><label>Nombre completo<input name="full_name" required placeholder="Ana Páez" /></label><label>Correo electrónico<input name="email" required type="email" placeholder="ana@correo.com" /></label></div>
          <div><label>Equipo<select name="team_id"><option value="">Sin equipo</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Rol<select name="role" defaultValue="territorio">{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          <div className="invite-actions"><button type="button" onClick={() => setInviteOpen(false)}>Cancelar</button><button className="primary compact" disabled={inviting}>{inviting ? "Enviando..." : "Enviar invitación"}</button></div>
        </form>}
        <div className="member-list">{members.map((member) => <div className={!member.active ? "member-disabled" : ""} key={member.user_id}>
          <span className="avatar">{(member.profiles?.full_name ?? "U").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><strong>{member.profiles?.full_name}</strong><small>{member.active ? "Usuario habilitado" : "Acceso desactivado"}</small></div>
          <select aria-label="Equipo" disabled={!member.active} value={member.team_id ?? ""} onChange={(e) => updateMember(member.user_id, "team_id", e.target.value)}><option value="">Sin equipo</option>{teams.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select>
          <select aria-label="Rol" disabled={!member.active} value={member.role} onChange={(e) => updateMember(member.user_id, "role", e.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <div className="member-actions"><button className={`member-toggle ${member.active ? "deactivate" : "activate"}`} disabled={member.user_id === profile.id} onClick={() => toggleMember(member)}>{member.active ? "Desactivar" : "Activar"}</button><button className="member-delete" disabled={member.user_id === profile.id} onClick={() => removeMember(member)}>Borrar</button></div>
          {member.role!=="admin"&&<div className="module-permissions">{configurableModules.map(([id,label])=><label key={id}><input type="checkbox" checked={(member.allowed_modules??(member.role==="coordinacion"?configurableModules.map(([x])=>x):member.role==="territorio"?["sedes","gestion","agenda","propuestas","territorio"]:member.role==="finanzas"?["presupuesto","agenda"]:["agenda"])).includes(id)} onChange={()=>toggleModule(member,id)}/>{label}</label>)}</div>}
        </div>)}</div>
        <div className="info-banner compact-info">Cada invitado recibirá un enlace para confirmar su cuenta y crear su contraseña. Nunca necesitás conocer su clave.</div>
      </article>
    </div>
    <article className="panel admin-section"><PanelHead kicker="SEGURIDAD Y TRAZABILIDAD" title="Actividad reciente" aside={`${auditItems.length} cambios`}/>{auditItems.length===0?<Empty title="Sin cambios para mostrar" text="Las nuevas modificaciones de usuarios, reclamos, proyectos y territorio aparecerán aquí."/>:<div className="audit-list">{auditItems.map(item=><div key={item.id}><span>{item.action.slice(0,1).toUpperCase()}</span><div><strong>{item.entity_type}</strong><small>{item.action} · registro {item.entity_id}</small></div><time>{new Date(item.created_at).toLocaleString("es-AR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>)}</div>}</article>
    {message && <button className="toast" onClick={() => setMessage("")}>{message}<span>×</span></button>}
  </section>;
}

function HomeDashboard({ organization, organizations, canAdmin, selectOrganization, teams, members, headquarters, entries, claims, projects, activities, referents, go }: {
  organization: Organization; organizations: Organization[]; canAdmin: boolean; selectOrganization: (id: string) => void;
  teams: Team[]; members: Member[]; headquarters: Headquarters[]; entries: BudgetEntry[]; claims:Claim[]; projects:Project[]; activities:Activity[]; referents:Referent[]; go: (id: string) => void;
}) {
  const totals = entries.reduce((acc, item) => { if (item.status !== "cancelado") acc[item.kind] += Number(item.amount); return acc; }, { ingreso: 0, gasto: 0, compromiso: 0 });
  const target = new Date();
  const year = target.getMonth() > 4 || (target.getMonth() === 4 && target.getDate() > 9) ? target.getFullYear() + 1 : target.getFullYear();
  const days = Math.max(0, Math.ceil((new Date(year, 4, 9).getTime() - target.getTime()) / 86400000));
  return <>
    <section className="hero-row"><div><p className="kicker">CENTRO DE OPERACIONES</p><h1>{organization.candidate_name}</h1><span>{organization.name} · {organization.position_sought}</span></div><div className="countdown"><span>CUENTA REGRESIVA</span><strong>{days}</strong><b>DÍAS</b><small>HASTA EL 9 DE MAYO</small></div></section>
    {canAdmin && organizations.length > 1 && <div className="home-organization-switch"><label htmlFor="home-organization">Espacio político activo</label><select id="home-organization" value={organization.id} onChange={(e) => selectOrganization(e.target.value)}>{organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select></div>}
    <section className="stats-grid">
      <article className="stat-card blue"><div className="stat-heading"><div className="card-icon">◎</div><h2>Organización: tu equipo</h2></div><p>EQUIPOS</p><strong>{teams.length}</strong><span>{teams.length === 1 ? "equipo configurado" : "equipos configurados"}</span><small>{members.length} {members.length === 1 ? "persona asignada" : "personas asignadas"}</small><button onClick={() => go("admin")}>Ver miembros</button></article>
      <article className="stat-card green"><div className="stat-heading"><div className="card-icon">⌂</div><h2>Territorio: tus sedes</h2></div><p>SEDES ACTIVAS</p><strong>{headquarters.length}</strong><span>Vinculadas a equipos y responsables</span><small>Cobertura territorial organizada</small><button onClick={() => go("sedes")}>＋ Añadir primera sede</button></article>
      <article className="stat-card amber"><div className="card-icon">$</div><p>RECURSOS</p><strong>{money.format(totals.ingreso - totals.gasto - totals.compromiso)}</strong><span>saldo proyectado</span><small>{entries.length} movimientos registrados</small></article>
    </section>
    <section className="content-grid">
      <article className="panel territory"><PanelHead kicker="ESTRUCTURA DE CAMPAÑA" title="Equipos activos" aside={`${teams.length} equipos`} />{teams.length ? <div className="team-overview">{teams.slice(0, 4).map((team) => <div key={team.id}><span>{team.name.slice(0, 1)}</span><div><strong>{team.name}</strong><small>{members.filter((m) => m.team_id === team.id).length} integrantes</small></div></div>)}</div> : <Empty title="Sin equipos" text="Creá el primero desde Administración." />}</article>
      <article className="panel agenda"><PanelHead kicker="PRÓXIMAS ACTIVIDADES" title="Agenda del equipo" aside={<button className="text-button" onClick={()=>go("agenda")}>Ver agenda</button>} />{activities.filter(a=>new Date(a.starts_at)>=new Date()).slice(0,4).map(a=><div className="task" key={a.id}><i className="blue"/><div><strong>{a.title}</strong><span>{new Date(a.starts_at).toLocaleString("es-AR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} · {a.location||"Lugar a definir"}</span></div><em>{a.status}</em></div>)}{activities.filter(a=>new Date(a.starts_at)>=new Date()).length===0&&<Empty title="Agenda libre" text="Cargá reuniones, recorridas y eventos desde Agenda."/>}</article>
    </section>
    <section className="dashboard-operations"><article className="panel"><PanelHead kicker="CALENDARIO" title={new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"})}/><MonthCalendar activities={activities}/></article><article className="panel"><PanelHead kicker="GESTIÓN TERRITORIAL" title="Situación actual"/><div className="operation-numbers"><div><b>{claims.filter(c=>!["resuelto","cerrado"].includes(c.status)).length}</b><span>reclamos pendientes</span></div><div><b>{claims.filter(c=>c.priority==="urgente").length}</b><span>casos urgentes</span></div><div><b>{projects.filter(p=>!["completado","cancelado"].includes(p.status)).length}</b><span>proyectos activos</span></div><div><b>{activities.filter(a=>new Date(a.starts_at)>=new Date()).length}</b><span>actividades próximas</span></div></div></article></section>
    <section className="results-strip"><article><b>{claims.length?Math.round(claims.filter(c=>["resuelto","cerrado"].includes(c.status)).length/claims.length*100):0}%</b><span>reclamos resueltos</span></article><article><b>{new Set(referents.map(r=>r.neighborhood).filter(Boolean)).size}</b><span>barrios cubiertos</span></article><article><b>{referents.filter(r=>r.status==="activo").length}</b><span>referentes activos</span></article><article><b>{projects.filter(p=>p.status==="completado").length}</b><span>proyectos completados</span></article></section>
    <section className="quick-section"><div><p className="kicker">ACCESOS RÁPIDOS</p><h2>¿Qué necesitás hacer?</h2></div><div className="quick-grid">
      <button onClick={() => go("admin")}><span>⚙</span><b>Configurar equipos</b><small>Personas, roles y espacios</small></button>
      <button onClick={() => go("sedes")}><span>⌂</span><b>Crear sede</b><small>Asignar equipo y responsable</small></button>
      <button onClick={() => go("presupuesto")}><span>$</span><b>Registrar movimiento</b><small>Ingreso, gasto o compromiso</small></button>
      <button onClick={() => go("gestion")}><span>!</span><b>Gestionar reclamos</b><small>Proyectos y necesidades vecinales</small></button>
    </div></section>
  </>;
}

function MonthCalendar({activities}:{activities:Activity[]}){
  const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),offset=(first.getDay()+6)%7;
  return <div className="month-calendar"><div className="calendar-week">{["L","M","X","J","V","S","D"].map(d=><b key={d}>{d}</b>)}</div><div className="calendar-days">{Array.from({length:offset},(_,i)=><span key={`e${i}`}/>) }{Array.from({length:days},(_,i)=>{const day=i+1,has=activities.some(a=>{const d=new Date(a.starts_at);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===day});return <span className={`${day===now.getDate()?"today":""} ${has?"has-event":""}`} key={day}>{day}</span>})}</div></div>;
}

function AgendaView({user,organization,teams,members,headquarters,items,reload}:{user:User;organization:Organization;teams:Team[];members:Member[];headquarters:Headquarters[];items:Activity[];reload:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("activities").insert({organization_id:organization.id,title:data.get("title"),activity_type:data.get("activity_type"),description:data.get("description")||null,starts_at:data.get("starts_at"),ends_at:data.get("ends_at")||null,location:data.get("location")||null,headquarters_id:data.get("headquarters_id")||null,team_id:data.get("team_id")||null,responsible_user_id:data.get("responsible_user_id")||null,created_by:user.id});if(error)setMessage("No se pudo guardar la actividad.");else{form.reset();setOpen(false);await reload();}}
 async function status(id:number,value:string){const {error}=await supabase.from("activities").update({status:value,updated_at:new Date().toISOString()}).eq("id",id);if(error)setMessage("No se pudo actualizar la actividad.");else await reload();}
 return <section><ModuleTitle kicker="ORGANIZACIÓN DIARIA" title="Agenda y actividades" subtitle="Reuniones, recorridas, eventos y tareas territoriales."><button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nueva actividad</button></ModuleTitle>{open&&<form className="entry-form panel" onSubmit={submit}><div className="form-grid"><label className="wide">Título<input name="title" required/></label><label>Tipo<select name="activity_type"><option value="reunion">Reunión</option><option value="recorrida">Recorrida</option><option value="evento">Evento</option><option value="capacitacion">Capacitación</option><option value="tarea">Tarea</option></select></label><label>Lugar<input name="location"/></label><label>Inicio<input type="datetime-local" name="starts_at" required/></label><label>Fin<input type="datetime-local" name="ends_at"/></label><label>Sede<select name="headquarters_id"><option value="">Sin sede</option>{headquarters.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Equipo<select name="team_id"><option value="">Todos</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label><label className="wide">Descripción<textarea name="description"/></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Guardar actividad</button></div></form>}<div className="agenda-layout"><article className="panel"><PanelHead kicker="CALENDARIO MENSUAL" title={new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"})}/><MonthCalendar activities={items}/></article><article className="panel"><PanelHead kicker="CRONOGRAMA" title="Actividades" aside={`${items.length} registros`}/>{items.length===0?<Empty title="Sin actividades" text="Agregá la primera reunión o recorrida."/>:<div className="activity-list">{items.map(a=><div key={a.id}><time>{new Date(a.starts_at).toLocaleDateString("es-AR",{day:"2-digit",month:"short"})}</time><div><strong>{a.title}</strong><small>{new Date(a.starts_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})} · {a.location||"Sin lugar"}</small></div><select value={a.status} onChange={e=>status(a.id,e.target.value)}><option value="programada">Programada</option><option value="confirmada">Confirmada</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option></select></div>)}</div>}</article></div>{message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}</section>;
}

function TerritoryView({user,organization,teams,members,headquarters,items,reload}:{user:User;organization:Organization;teams:Team[];members:Member[];headquarters:Headquarters[];items:Referent[];reload:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("territorial_referents").insert({organization_id:organization.id,full_name:data.get("full_name"),phone:data.get("phone")||null,email:data.get("email")||null,referent_type:data.get("referent_type"),neighborhood:data.get("neighborhood")||null,circuit:data.get("circuit")||null,zone:data.get("zone")||null,headquarters_id:data.get("headquarters_id")||null,team_id:data.get("team_id")||null,reports_to_user_id:data.get("reports_to_user_id")||null,influence_level:data.get("influence_level"),notes:data.get("notes")||null,latitude:data.get("latitude")||null,longitude:data.get("longitude")||null,created_by:user.id});if(error)setMessage("No se pudo guardar el referente.");else{form.reset();setOpen(false);await reload();}}
 async function status(id:number,value:string){const {error}=await supabase.from("territorial_referents").update({status:value,updated_at:new Date().toISOString()}).eq("id",id);if(error)setMessage("No se pudo actualizar el referente.");else await reload();}
 return <section><ModuleTitle kicker="ORGANIZACIÓN TERRITORIAL" title="Referentes y dirigentes" subtitle="Cobertura por barrios, circuitos, sedes y equipos."><button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nuevo referente</button></ModuleTitle><div className="claim-summary"><article><b>{items.filter(i=>i.status==="activo").length}</b><span>Activos</span></article><article><b>{new Set(items.map(i=>i.neighborhood).filter(Boolean)).size}</b><span>Barrios cubiertos</span></article><article><b>{items.filter(i=>i.referent_type==="dirigente").length}</b><span>Dirigentes</span></article><article><b>{items.filter(i=>i.influence_level==="alto").length}</b><span>Alcance alto</span></article></div>{open&&<form className="entry-form panel" onSubmit={submit}><div className="form-grid"><label className="wide">Nombre completo<input name="full_name" required/></label><label>Tipo<select name="referent_type"><option value="referente">Referente</option><option value="dirigente">Dirigente</option><option value="puntero">Puntero</option><option value="colaborador">Colaborador</option></select></label><label>Alcance<select name="influence_level"><option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option></select></label><label>Teléfono<input name="phone"/></label><label>Correo<input type="email" name="email"/></label><label>Barrio<input name="neighborhood"/></label><label>Circuito<input name="circuit"/></label><label>Zona<input name="zone"/></label><label>Sede<select name="headquarters_id"><option value="">Sin sede</option>{headquarters.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Equipo<select name="team_id"><option value="">Sin equipo</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Responsable político<select name="reports_to_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label><label className="wide">Notas<textarea name="notes"/></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Guardar referente</button></div></form>}<article className="panel"><PanelHead kicker="RED TERRITORIAL" title="Personas registradas" aside={`${items.length} personas`}/>{items.length===0?<Empty title="Sin referentes registrados" text="Agregá dirigentes y colaboradores para visualizar la cobertura territorial."/>:<div className="referent-list">{items.map(r=><div key={r.id}><span>{r.full_name.split(/\s+/).map(x=>x[0]).join("").slice(0,2)}</span><div><strong>{r.full_name}</strong><small>{r.referent_type} · {r.neighborhood||r.zone||"Zona sin definir"} · {r.phone||"Sin teléfono"}</small></div><em>{r.influence_level}</em><select value={r.status} onChange={e=>status(r.id,e.target.value)}><option value="activo">Activo</option><option value="pausado">Pausado</option><option value="desvinculado">Desvinculado</option></select></div>)}</div>}</article>{message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}</section>;
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
  const [claims, setClaims] = useState<Claim[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [referents, setReferents] = useState<Referent[]>([]);
  const [voterImports, setVoterImports] = useState<VoterImport[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [menuOpen,setMenuOpen]=useState(false);
  const [bellOpen,setBellOpen]=useState(false);
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
    const [teamResult, memberResult, sedeResult, budgetResult, claimResult, projectResult, proposalResult, activityResult, referentResult,importResult,auditResult] = await Promise.all([
      supabase.from("teams").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
      supabase.from("memberships").select("organization_id,user_id,team_id,role,active,allowed_modules,profiles(id,full_name,active)").eq("organization_id", organizationId),
      supabase.from("headquarters").select("id,name,address,circuit,phone,team_id,responsible_user_id,active,latitude,longitude").eq("organization_id", organizationId).eq("active", true).order("name"),
      supabase.from("budget_entries").select("id,kind,category,description,amount,occurred_on,status,payment_method").eq("organization_id", organizationId).order("occurred_on", { ascending: false }).limit(100),
      supabase.from("claims").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("projects").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("proposals").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("activities").select("*").eq("organization_id",organizationId).order("starts_at",{ascending:true}).limit(300),
      supabase.from("territorial_referents").select("*").eq("organization_id",organizationId).order("full_name").limit(500),
      supabase.from("voter_imports").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(25),
      supabase.from("audit_log").select("id,entity_type,entity_id,action,details,created_at,actor_id").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(50),
    ]);
    setTeams((teamResult.data ?? []) as Team[]);
    setMembers((memberResult.data ?? []) as unknown as Member[]);
    setHeadquarters((sedeResult.data ?? []) as Headquarters[]);
    setEntries(budgetResult.error ? [] : (budgetResult.data ?? []) as BudgetEntry[]);
    setClaims(claimResult.error?[]:(claimResult.data??[]) as Claim[]);
    setProjects(projectResult.error?[]:(projectResult.data??[]) as Project[]);
    setProposals(proposalResult.error?[]:(proposalResult.data??[]) as Proposal[]);
    setActivities(activityResult.error?[]:(activityResult.data??[]) as Activity[]);
    setReferents(referentResult.error?[]:(referentResult.data??[]) as Referent[]);
    setVoterImports(importResult.error?[]:(importResult.data??[]) as VoterImport[]);
    setAuditItems(auditResult.error?[]:(auditResult.data??[]) as AuditItem[]);
  }, [organizationId]);
  useEffect(() => { void loadOrganizations(); }, [loadOrganizations]);
  useEffect(() => { void loadContext(); }, [loadContext]);

  async function reloadAll() { await loadOrganizations(); await loadContext(); }
  const allModules = [
    { id: "inicio", label: "Inicio", icon: "⌂" }, { id: "votantes", label: "Votantes", icon: "◎" },
    { id: "sedes", label: "Sedes", icon: "◇" }, { id: "presupuesto", label: "Presupuesto", icon: "$" },
    { id: "gestion", label: "Gestión", icon: "!" },
    { id: "agenda", label: "Agenda", icon: "▣" },
    { id: "propuestas", label: "Propuestas", icon: "◆" },
    { id: "territorio", label: "Territorio", icon: "◎" },
    ...(canAdmin ? [{ id: "admin", label: "Administración", icon: "⚙" }] : []),
  ];
  const modules=allModules.filter(item=>item.id==="inicio"||item.id==="admin"||profile.is_platform_admin||orgRole==="admin"||(membership?.allowed_modules??(orgRole==="coordinacion"?configurableModules.map(([id])=>id):orgRole==="territorio"?["sedes","gestion","agenda","propuestas","territorio"]:orgRole==="finanzas"?["presupuesto","agenda"]:["agenda"])).includes(item.id));
  function go(id: string) {
    if (id === "presupuesto" && !canFinance) return setNotice("Tu rol no tiene acceso al presupuesto.");
    if (id === "admin" && !canAdmin) return setNotice("Tu rol no tiene acceso a Administración.");
    if(!modules.some(module=>module.id===id))return setNotice("No tenés permiso para acceder a este módulo.");
    setActive(id);setMenuOpen(false);
  }
  if (!organization) return <main className="access-state"><Logo /><h1>Sin espacio asignado</h1><p>Tu cuenta está activa, pero aún no pertenece a una organización política.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;

  const initials = profile.full_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const notifications=[
    ...claims.filter(c=>c.priority==="urgente"&&!["resuelto","cerrado"].includes(c.status)).map(c=>({id:`c${c.id}`,title:"Reclamo urgente",text:c.title,module:"gestion"})),
    ...projects.filter(p=>p.due_date&&new Date(`${p.due_date}T23:59:59`).getTime()<Date.now()&&!["completado","cancelado"].includes(p.status)).map(p=>({id:`p${p.id}`,title:"Proyecto vencido",text:p.name,module:"gestion"})),
    ...activities.filter(a=>{const diff=new Date(a.starts_at).getTime()-Date.now();return diff>=0&&diff<=86400000&&!["realizada","cancelada"].includes(a.status)}).map(a=>({id:`a${a.id}`,title:"Actividad próxima",text:a.title,module:"agenda"}))
  ].slice(0,20);
  return <main className="app-shell" style={{"--navy":organization.primary_color,"--sun":organization.accent_color} as React.CSSProperties}>
    <header className="topbar">
      <div className="topbar-brand"><button className="menu-trigger" aria-label="Abrir menú" onClick={()=>setMenuOpen(true)}>☰</button><Logo compact /></div>
      <div className="topbar-actions"><button className="bell-button" aria-label={`Notificaciones: ${notifications.length}`} onClick={()=>setBellOpen(!bellOpen)}>🔔{notifications.length>0&&<b>{notifications.length}</b>}</button><button className="profile" onClick={() => void supabase.auth.signOut()} title="Cerrar sesión"><span>{initials}</span><b>{profile.full_name}</b><em>{roleLabels[orgRole]}</em><small>Salir</small></button></div>
    </header>
    {bellOpen&&<aside className="notification-panel"><div><strong>Notificaciones</strong><button onClick={()=>setBellOpen(false)}>×</button></div>{notifications.length===0?<Empty title="Todo al día" text="No hay avisos urgentes ni vencimientos cercanos."/>:notifications.map(item=><button key={item.id} onClick={()=>{go(item.module);setBellOpen(false)}}><i/><span><b>{item.title}</b><small>{item.text}</small></span></button>)}</aside>}
    <div className="page">
      {active === "inicio" && <HomeDashboard organization={organization} organizations={organizations} canAdmin={canAdmin} selectOrganization={setOrganizationId} teams={teams} members={members} headquarters={headquarters} entries={entries} claims={claims} projects={projects} activities={activities} referents={referents} go={go} />}
      {active === "votantes" && <VotersView user={session.user} organization={organization} items={voterImports} reload={loadContext}/>}
      {active === "sedes" && <HeadquartersView organization={organization} teams={teams} members={members} items={headquarters} reload={loadContext} />}
      {active === "presupuesto" && <Budget user={session.user} organization={organization} entries={entries} reload={loadContext} />}
      {active === "gestion" && <ManagementView user={session.user} organization={organization} teams={teams} members={members} headquarters={headquarters} claims={claims} projects={projects} reload={loadContext} />}
      {active === "propuestas" && <ProposalsView user={session.user} organization={organization} members={members} claims={claims} projects={projects} items={proposals} reload={loadContext}/>}
      {active === "agenda" && <AgendaView user={session.user} organization={organization} teams={teams} members={members} headquarters={headquarters} items={activities} reload={loadContext}/>}
      {active === "territorio" && <TerritoryView user={session.user} organization={organization} teams={teams} members={members} headquarters={headquarters} items={referents} reload={loadContext}/>}
      {active === "territorio" && <article className="panel territory-map-panel"><PanelHead kicker="MAPA GRATUITO · OPENSTREETMAP" title="Cobertura territorial" aside={`${headquarters.filter(x=>x.latitude&&x.longitude).length+claims.filter(x=>x.latitude&&x.longitude).length+referents.filter(x=>x.latitude&&x.longitude).length} ubicaciones`}/><TerritoryMap points={[
        ...headquarters.filter(x=>x.latitude&&x.longitude).map(x=>({id:`s-${x.id}`,latitude:Number(x.latitude),longitude:Number(x.longitude),title:x.name,detail:x.address,kind:"sede" as const})),
        ...claims.filter(x=>x.latitude&&x.longitude).map(x=>({id:`c-${x.id}`,latitude:Number(x.latitude),longitude:Number(x.longitude),title:x.title,detail:`Reclamo · ${x.address}`,kind:"reclamo" as const})),
        ...referents.filter(x=>x.latitude&&x.longitude).map(x=>({id:`r-${x.id}`,latitude:Number(x.latitude),longitude:Number(x.longitude),title:x.full_name,detail:`Referente · ${x.neighborhood||x.zone||"Sin zona"}`,kind:"referente" as const}))
      ] satisfies MapPoint[]}/><div className="map-legend"><span><i className="sede"/>Sedes</span><span><i className="reclamo"/>Reclamos</span><span><i className="referente"/>Referentes</span></div></article>}
      {active === "admin" && <AdminView profile={profile} organization={organization} organizations={organizations} teams={teams} members={members} auditItems={auditItems} reloadAll={reloadAll} selectOrganization={setOrganizationId} />}
    </div>
    {menuOpen&&<button className="menu-backdrop" aria-label="Cerrar menú" onClick={()=>setMenuOpen(false)}/>}<aside className={`side-menu ${menuOpen?"open":""}`}><div className="side-menu-head"><Logo compact/><button onClick={()=>setMenuOpen(false)}>×</button></div><p className="kicker">MÓDULOS HABILITADOS</p><nav aria-label="Navegación principal">{modules.map(item=><button className={active===item.id?"active":""} onClick={()=>go(item.id)} key={item.id}><span>{item.icon}</span>{item.label}</button>)}</nav><div className="side-user"><b>{profile.full_name}</b><span>{roleLabels[orgRole]} · {organization.name}</span></div></aside>
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
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void supabase.auth.signOut(), 30 * 60 * 1000);
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, reset)); };
  }, [session]);
  useEffect(() => {
    if (!session) return; setLoading(true);
    supabase.from("profiles").select("id,full_name,role,active,is_platform_admin").eq("id", session.user.id).single().then(({ data }) => { setProfile(data as Profile | null); setLoading(false); });
  }, [session]);
  if (loading) return <main className="loading-screen"><Logo /><p>Preparando tu espacio de trabajo...</p></main>;
  if (!session) return <Login />;
  if (!profile || !profile.active) return <main className="access-state"><Logo /><h1>Acceso pendiente</h1><p>La cuenta debe ser habilitada por Administración.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;
  return <Dashboard session={session} profile={profile} />;
}
