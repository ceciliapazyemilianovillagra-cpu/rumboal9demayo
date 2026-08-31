"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { firebase as supabase, type Session, type User } from "../lib/firebase";
import { TerritoryMap } from "./territory-map";
import { isNagleWorkspace } from "./staff-workspace";
import QRCode from "qrcode";
import readXlsxFile from "read-excel-file";

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
  team_id: string | null; responsible_user_id: string | null; active: boolean; latitude:number|null; longitude:number|null; location_type?:LocationType;
};
type LocationType = "sede"|"centro_comunitario"|"club"|"fundacion"|"escuela"|"cooperativa"|"punto_encuentro";
const locationTypeLabels:Record<LocationType,string>={sede:"Sede",centro_comunitario:"Centro comunitario",club:"Club",fundacion:"Fundación",escuela:"Escuela",cooperativa:"Cooperativa",punto_encuentro:"Punto de encuentro"};
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
type Voter = { id:number; dni:string; full_name:string; address:string|null; circuit:string|null; polling_place:string|null; contact_status:string; assigned_to:string|null; source_data:Record<string,unknown> };
type AuditItem = { id:number; entity_type:string; entity_id:string; action:string; details:Record<string,unknown>; created_at:string; actor_id:string|null };
type NotificationRead = { id:string; organization_id:string; user_id:string; notification_id:string; read_at:string };
type CampaignRecord = { id:string; organization_id:string; title:string; status:string; priority:string; responsible_user_id:string|null; scheduled_for:string|null; location:string|null; notes:string|null; created_at:string; record_type?:string; contact_name?:string|null; contact_phone?:string|null; linked_location_id?:string|null };
type EventAttendance = { id:string; organization_id:string; event_id:string; full_name:string; phone:string|null; neighborhood:string|null; source:string; created_at:string };
type PublicLink = { id:string; organization_id:string; module:string; active:boolean; expires_at_ms:number; label?:string };
type AuthorizedAccess = { id:string; organization_id:string; full_name:string; email:string; team_id:string|null; role:Role; allowed_modules:string[]; active:boolean; created_at?:string };
const configurableModules=[["votantes","Votantes"],["sedes","Locaciones"],["presupuesto","Presupuesto"],["gestion","Gestión"],["agenda","Agenda"],["eventos","Eventos"],["logistica","Logística"],["fiscalizacion","Fiscalización electoral"]] as const;

const roleLabels: Record<Role, string> = {
  admin: "Administrador", coordinacion: "Coordinación", territorio: "Territorio",
  finanzas: "Finanzas", consulta: "Consulta",
};
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`logo-lockup ${compact ? "compact" : ""}`}>
    {/* vinext sirve este activo local sin el runtime de optimización de Next Image. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/rumbo-logo.png" alt="Logo de Rumbo al 9 de Mayo" />
    <div><span>RUMBO AL</span><strong>9 DE MAYO</strong></div>
  </div>;
}

function Splash() {
  return <main className="loading-screen">
    <Logo />
    <div className="splash-copy"><strong>Centro de operaciones</strong><span>Preparando tu espacio de trabajo</span></div>
    <div className="splash-progress" role="progressbar" aria-label="Cargando la aplicación"><i /></div>
  </main>;
}

function dateKey(value: Date) {
  const year=value.getFullYear(),month=String(value.getMonth()+1).padStart(2,"0"),day=String(value.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function activitiesForDate(items:Activity[],selectedDate:string) {
  return items.filter(item=>dateKey(new Date(item.starts_at))===selectedDate);
}

function LocationInputs({initialLocation}:{initialLocation?:{latitude:number;longitude:number}|null}) {
  const [coordinates,setCoordinates]=useState({latitude:initialLocation?.latitude.toFixed(7)??"",longitude:initialLocation?.longitude.toFixed(7)??""});
  const [message,setMessage]=useState("");
  useEffect(()=>{if(initialLocation){setCoordinates({latitude:initialLocation.latitude.toFixed(7),longitude:initialLocation.longitude.toFixed(7)});setMessage("Ubicación seleccionada en el mapa.");}},[initialLocation]);
  function locate(){
    if(!navigator.geolocation)return setMessage("Este dispositivo no permite obtener la ubicación.");
    setMessage("Buscando ubicación...");
    navigator.geolocation.getCurrentPosition(
      position=>{setCoordinates({latitude:position.coords.latitude.toFixed(7),longitude:position.coords.longitude.toFixed(7)});setMessage("Ubicación agregada.");},
      ()=>setMessage("No se pudo obtener la ubicación. Podés continuar sin mapa."),
      {enableHighAccuracy:true,timeout:12000}
    );
  }
  return <div className="location-fields"><input type="hidden" name="latitude" value={coordinates.latitude}/><input type="hidden" name="longitude" value={coordinates.longitude}/><button type="button" onClick={locate}>⌖ Usar ubicación actual</button>{coordinates.latitude&&<b>{coordinates.latitude}, {coordinates.longitude}</b>}{message&&<small>{message}</small>}</div>;
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

function PublicForm({token,formType}:{token:string;formType:string}) {
  const [link,setLink]=useState<PublicLink|null>(null),[message,setMessage]=useState("Preparando formulario..."),[busy,setBusy]=useState(false);
  useEffect(()=>{void (async()=>{const auth=await supabase.auth.signInAnonymously();if(auth.error)return setMessage("Este enlace requiere habilitar el acceso anónimo en Firebase.");const result=await supabase.from("public_links").select("*").eq("id",token).maybeSingle();const data=result.data as PublicLink|null;if(result.error||!data||!data.active||data.expires_at_ms<Date.now()||data.module!==formType)return setMessage("Este enlace no es válido o ya venció.");setLink(data);setMessage("");})();},[token,formType]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!link)return;setBusy(true);const data=new FormData(event.currentTarget),common={organization_id:link.organization_id,public_token:token,created_via:"public",created_at:new Date().toISOString()};let result;if(formType==="gestion")result=await supabase.from("claims").insert({...common,title:data.get("title"),description:data.get("description"),category:data.get("category"),priority:"media",address:data.get("address")||"Sin dirección",neighbor_name:data.get("full_name")||null,neighbor_phone:data.get("phone")||null,status:"nuevo"});else if(formType==="eventos")result=await supabase.from("event_attendance").insert({...common,event_id:data.get("event_id")||"enlace-publico",full_name:data.get("full_name"),phone:data.get("phone")||null,neighborhood:data.get("neighborhood")||null,source:"enlace"});else result=await supabase.from(formType==="logistica"?"logistics_items":"election_day_assignments").insert({...common,title:data.get("title"),record_type:formType==="logistica"?"Reporte de móvil":"Reporte de fiscal",status:"pendiente",priority:"media",contact_name:data.get("full_name")||null,contact_phone:data.get("phone")||null,location:data.get("location")||null,notes:data.get("notes")||null});setBusy(false);if(result.error)setMessage("No se pudo enviar. Probá nuevamente o comunicáte con el equipo.");else{event.currentTarget.reset();setMessage("¡Gracias! La información fue enviada correctamente.");}}
  const title={gestion:"Compartí tu reclamo o propuesta",eventos:"Confirmá tu asistencia",logistica:"Reporte de movilidad",fiscalizacion:"Reporte de fiscalización"}[formType]||"Formulario";
  if(!link)return <main className="access-state"><Logo/><h1>{message||"Cargando..."}</h1><p>Este formulario es seguro y sólo se utiliza para la actividad informada.</p></main>;
  return <main className="login-shell public-form-shell"><section className="login-brand"><Logo/><p className="login-overline">FORMULARIO DEL EQUIPO</p><h1>{title}</h1><span>Completá sólo los datos necesarios. No necesitás crear una cuenta.</span></section><form className="login-card" onSubmit={submit}><div className="login-heading"><span className="kicker">REGISTRO SEGURO</span><h2>{link.label||title}</h2></div>{formType==="gestion"&&<><label>Motivo<input name="title" required placeholder="Ej.: Falta de iluminación"/></label><label>Categoría<select name="category"><option>Reclamo barrial</option><option>Sugerencia</option><option>Proyecto comunitario</option></select></label><label>Descripción<textarea name="description" required/></label><label>Dirección o barrio<input name="address"/></label></>}{formType==="eventos"&&<label>Evento<input name="event_id" placeholder="Nombre del evento" required/></label>}{formType!=="gestion"&&formType!=="eventos"&&<><label>Asunto<input name="title" required placeholder="Resumen del reporte"/></label><label>Ubicación<input name="location"/></label><label>Detalle<textarea name="notes"/></label></>}<label>Nombre completo<input name="full_name" required/></label><label>Teléfono<input name="phone" inputMode="tel"/></label>{formType==="eventos"&&<label>Barrio<input name="neighborhood"/></label>}{message&&<p className="form-message">{message}</p>}<button className="primary" disabled={busy}>{busy?"Enviando...":"Enviar información"}</button></form></main>;
}

function LinkQr({value}:{value:string}) {
  const [image,setImage]=useState("");
  useEffect(()=>{void QRCode.toDataURL(value,{width:220,margin:1,color:{dark:"#182554",light:"#ffffff"}}).then(setImage);},[value]);
  return image?<div className="link-qr"><img src={image} alt="Código QR del enlace externo"/><small>Escaneá para abrir el formulario</small></div>:null;
}

function BulkTemplateButton({file,label}:{file:string;label:string}) { return <a className="pdf-button" href={`/${file}`} download>↓ Modelo {label}</a>; }

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [firstAccess,setFirstAccess]=useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const normalizedEmail=email.trim().toLowerCase();
    if(firstAccess&&password!==confirmPassword){setMessage("Las contraseñas no coinciden.");setBusy(false);return;}
    if(firstAccess&&password.length<6){setMessage("La contraseña debe tener al menos 6 caracteres.");setBusy(false);return;}
    const result = firstAccess ? await supabase.auth.signUpWithPassword({ email: normalizedEmail, password }) : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    const errorCode=String((result.error as {code?:string}|null)?.code||"");
    if (result.error) {
      if(firstAccess&&errorCode==="auth/email-already-in-use") setMessage("Este correo ya tiene acceso creado. Volvé a Ingresar o recuperá tu contraseña.");
      else if(firstAccess&&errorCode==="auth/operation-not-allowed") setMessage("El ingreso por correo todavía no está habilitado en Firebase.");
      else if(firstAccess&&errorCode==="auth/invalid-email") setMessage("Revisá el correo ingresado.");
      else if(!firstAccess) setMessage("Usuario o contraseña incorrectos. Si todavía no tenés acceso, elegí Ingreso por primera vez.");
      else setMessage("No se pudo crear el acceso. Revisá el correo y probá nuevamente.");
    }
    else {
      const activation=await supabase.access.activateAuthorizedAccess();
      if(activation.error) setMessage("No se pudo verificar tu acceso. Probá nuevamente en unos minutos.");
      else if(activation.pending) setMessage("Tu solicitud quedó enviada. Esperá la verificación del referente de tu campaña.");
    }
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
      <div className="login-heading"><span className="kicker">ACCESO AL EQUIPO</span><h2>{firstAccess?"Ingreso por primera vez":"Ingresar"}</h2><p>{firstAccess?"Completá tus datos una sola vez. Si tu correo está autorizado, vas a entrar automáticamente.":"Ingresá con el usuario y contraseña asignados."}</p></div>
      <label>Usuario / correo electrónico<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" autoComplete="email" /></label>
      <label>Contraseña<input required type="password" minLength={firstAccess?6:undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={firstAccess?"new-password":"current-password"} /></label>
      {firstAccess&&<label>Confirmar contraseña<input required type="password" minLength={6} value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} placeholder="Repetí la contraseña" autoComplete="new-password" /></label>}
      <div className="login-options"><span>Usuarios autorizados</span><button type="button" onClick={resetPassword}>¿Olvidaste tu contraseña?</button></div>
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="primary" disabled={busy}>{busy ? "Verificando..." : firstAccess?"Solicitar acceso":"Ingresar a la plataforma"} <span>→</span></button>
      <button className="text-button login-switch" type="button" onClick={()=>{setFirstAccess(current=>!current);setMessage("");setConfirmPassword("");}}>{firstAccess?"← Ya tengo usuario y contraseña":"Ingreso por primera vez"}</button>
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

function LocationsView({ organization, teams, members, items, reload, initialLocation=null }: {
  organization: Organization; teams: Team[]; members: Member[]; items: Headquarters[]; reload: () => Promise<void>; initialLocation?:{latitude:number;longitude:number}|null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pickedLocation,setPickedLocation]=useState<{latitude:number;longitude:number}|null>(initialLocation);
  useEffect(()=>{if(initialLocation){setOpen(true);window.setTimeout(()=>document.getElementById("headquarters-entry-form")?.scrollIntoView({behavior:"smooth",block:"center"}),80);}},[initialLocation]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const { error } = await supabase.from("headquarters").insert({
      organization_id: organization.id, name: data.get("name"), address: data.get("address"), location_type:data.get("location_type")||"sede",
      circuit: data.get("circuit") || null, phone: data.get("phone") || null,
      team_id: data.get("team_id") || null, responsible_user_id: data.get("responsible_user_id") || null,
      latitude:data.get("latitude")||null,longitude:data.get("longitude")||null,
    });
    if (error) setMessage(`No se pudo crear la locación: ${error.message}`);
    else { form.reset(); setOpen(false); await reload(); }
  }
  return <section>
    <ModuleTitle kicker="MAPA Y PUNTOS DE REFERENCIA" title="Locaciones" subtitle="Sedes, centros comunitarios, clubes, fundaciones, escuelas, cooperativas y puntos de encuentro.">
      <div className="module-actions"><BulkTemplateButton file="modelo-locaciones.csv" label="Excel"/><button className="primary compact" onClick={() => { setPickedLocation(null); setOpen(!open); }}>＋ Nueva locación</button></div>
    </ModuleTitle>
    <article className="panel territory-map-panel territory-map-primary"><PanelHead kicker="MAPA INTERACTIVO" title="Ubicaciones registradas" aside={`${items.length} locaciones`}/><TerritoryMap points={items.filter(item=>item.latitude!==null&&item.longitude!==null).map(item=>({id:`l-${item.id}`,latitude:Number(item.latitude),longitude:Number(item.longitude),title:item.name,detail:`${locationTypeLabels[item.location_type??"sede"]} · ${item.address}`,kind:item.location_type??"sede"}))} onCreateHeadquarters={location=>{setPickedLocation(location);setOpen(true);window.setTimeout(()=>document.getElementById("headquarters-entry-form")?.scrollIntoView({behavior:"smooth",block:"center"}),80);}}/></article>
    {open && <form id="headquarters-entry-form" className="entry-form panel" onSubmit={submit}>
      <div className="form-head"><div><p className="kicker">NUEVA LOCACIÓN</p><h2>Datos del lugar</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <div className="form-grid">
        <label>Tipo<select name="location_type" defaultValue="sede">{Object.entries(locationTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Nombre<input name="name" required placeholder="Ej.: Club Barrio Norte" /></label>
        <label className="wide">Dirección<input name="address" required placeholder="Calle y número" /></label>
        <label>Circuito<input name="circuit" placeholder="Opcional" /></label>
        <label>Teléfono<input name="phone" placeholder="Opcional" /></label>
        <label>Equipo<select name="team_id"><option value="">Sin asignar</option>{teams.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
        <label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.map((m) => <option value={m.user_id} key={m.user_id}>{m.profiles?.full_name}</option>)}</select></label>
        <LocationInputs initialLocation={pickedLocation}/>
      </div>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions"><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary compact">Guardar locación</button></div>
    </form>}
    {items.length === 0 ? <article className="panel"><Empty title="Todavía no hay locaciones" text="Cargá la primera ubicación o elegí su punto exacto directamente en el mapa." /></article> :
      <div className="cards-list">{items.map((item) => <article className="panel sede-card" key={item.id}><span className="card-symbol">⌂</span><div><p className="kicker">{locationTypeLabels[item.location_type??"sede"].toUpperCase()}</p><h2>{item.name}</h2><span>{item.address}</span><small>{teams.find((t) => t.id === item.team_id)?.name ?? "Sin equipo"} · {members.find((m) => m.user_id === item.responsible_user_id)?.profiles?.full_name ?? "Sin responsable"}</small></div></article>)}</div>}
  </section>;
}

function VotersView({user,organization,items,voters,reload}:{user:User;organization:Organization;items:VoterImport[];voters:Voter[];reload:()=>Promise<void>}) {
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("todos");
  const filteredVoters=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase("es");
    return voters.filter(voter=>{
      const matchesStatus=statusFilter==="todos"||voter.contact_status===statusFilter;
      const matchesSearch=!query||[voter.full_name,voter.dni,voter.address,voter.circuit,voter.polling_place].some(value=>value?.toLocaleLowerCase("es").includes(query));
      return matchesStatus&&matchesSearch;
    });
  },[voters,search,statusFilter]);

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
  async function changeContactStatus(id:number,contact_status:string){
    const {error}=await supabase.from("voters").update({contact_status}).eq("id",id).eq("organization_id",organization.id);
    if(error)setMessage("No se pudo actualizar el contacto.");else await reload();
  }
  return <section className="voters-shell">
    <ModuleTitle kicker="BASE ELECTORAL" title="Votantes" subtitle="Ejemplo ficticio preparado para mostrar búsqueda, circuito, escuela y seguimiento territorial." />
    <div className="voter-metrics">
      <article><b>{voters.length}</b><span>votantes demo</span></article>
      <article><b>{voters.filter(v=>v.contact_status!=="sin_contactar").length}</b><span>contactados</span></article>
      <article><b>{voters.filter(v=>v.contact_status==="apoya").length}</b><span>adhesiones</span></article>
      <article><b>{new Set(voters.map(v=>v.circuit).filter(Boolean)).size}</b><span>circuitos</span></article>
    </div>
    <article className="panel voter-plan">
      <div className="voter-hero"><div><p className="kicker">IMPORTACIÓN PREPARADA</p><h2>Preparar el padrón</h2><p>Descargá el modelo, completalo cuando recibas la información oficial y analizá sus columnas antes de incorporar datos.</p><a className="pdf-button" href="/plantilla-padron.xlsx" download>↓ Descargar modelo Excel</a></div></div>
      <form className="voter-import-form" onSubmit={prepareImport}><div><strong>Analizar un padrón</strong><span>Verifica encabezados y formato sin incorporar datos sensibles todavía.</span></div><input name="padron" type="file" accept=".csv,.xlsx" required/><button className="primary compact" disabled={busy}>{busy?"Analizando...":"Analizar archivo"}</button></form>
      {message&&<div className="info-banner">{message}</div>}
    </article>
    <article className="panel voter-directory">
      <PanelHead kicker="PADRÓN DEMOSTRATIVO" title="Personas registradas" aside={`${filteredVoters.length} resultados`}/>
      <div className="voter-toolbar">
        <label><span>Buscar</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nombre, DNI, escuela o circuito"/></label>
        <label><span>Estado</span><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="todos">Todos</option><option value="sin_contactar">Sin contactar</option><option value="contactado">Contactado</option><option value="indeciso">Indeciso</option><option value="apoya">Apoya</option></select></label>
      </div>
      <div className="voter-table-wrap">
        <table className="voter-table">
          <thead><tr><th>Votante</th><th>Circuito y escuela</th><th>Domicilio</th><th>Seguimiento</th></tr></thead>
          <tbody>{filteredVoters.map(voter=><tr key={voter.id}><td><strong>{voter.full_name}</strong><small>{voter.dni}</small></td><td><strong>{voter.circuit||"Sin circuito"}</strong><small>{voter.polling_place||"Sin establecimiento"}</small></td><td>{voter.address||"Sin domicilio"}</td><td><select aria-label={`Estado de ${voter.full_name}`} value={voter.contact_status} onChange={event=>void changeContactStatus(voter.id,event.target.value)}><option value="sin_contactar">Sin contactar</option><option value="contactado">Contactado</option><option value="indeciso">Indeciso</option><option value="apoya">Apoya</option></select></td></tr>)}</tbody>
        </table>
      </div>
      {filteredVoters.length===0&&<Empty title="No hay coincidencias" text="Probá con otro nombre, circuito o estado de contacto."/>}
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

const campaignModuleConfig={
  eventos:{collection:"campaign_events",kicker:"CONVOCATORIA Y ASISTENCIA",title:"Eventos",subtitle:"Organizá reuniones, actos y capacitaciones; registrá asistentes y exportá la lista.",singular:"evento",types:["Reunión","Acto","Capacitación","Visita","Encuentro vecinal"]},
  logistica:{collection:"logistics_items",kicker:"RECURSOS Y MOVILIDAD",title:"Logística",subtitle:"Registrá vehículos, movilizadores, insumos y asignaciones de campaña.",singular:"recurso",types:["Vehículo","Movilizador","Insumo","Asignación","Combustible"]},
  fiscalizacion:{collection:"election_day_assignments",kicker:"COBERTURA ELECTORAL",title:"Fiscalización",subtitle:"Asigná fiscales a escuelas y mesas, con seguimiento de cobertura e incidencias.",singular:"asignación",types:["Fiscal general","Fiscal de mesa","Escuela","Incidencia","Reporte"]},
} as const;

type MobilityTransfer={id:string;voter_id:string;voter_name:string;driver_user_id:string;driver_name?:string|null;vehicle_plate?:string|null;destination_name:string;status:"pendiente"|"buscada"|"en_destino"|"regresada";status_updated_at?:string|null};
function MobilityOperator({organization,members,locations,voters,vehicles}:{organization:Organization;members:Member[];locations:Headquarters[];voters:Voter[];vehicles:CampaignRecord[]}){
 const [items,setItems]=useState<MobilityTransfer[]>([]),[open,setOpen]=useState(false),[message,setMessage]=useState(""),[filter,setFilter]=useState("todos");
 const load=useCallback(async()=>{const result=await supabase.from("mobility_transfers").select("*").eq("organization_id",organization.id).order("status_updated_at",{ascending:false});setItems(result.error?[]:(result.data??[]) as MobilityTransfer[]);},[organization.id]);
 useEffect(()=>{void load();},[load]);
 async function assign(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form),voter=voters.find(item=>String(item.id)===String(data.get("voter_id"))),driver=members.find(item=>item.user_id===data.get("driver_user_id")),destination=locations.find(item=>String(item.id)===String(data.get("destination_id")));if(!voter||!driver||!destination)return setMessage("Elegí votante, chofer y destino.");const {error}=await supabase.from("mobility_transfers").insert({id:crypto.randomUUID(),organization_id:organization.id,operation_date:data.get("operation_date"),voter_id:String(voter.id),voter_dni:voter.dni,voter_name:voter.full_name,pickup_address:voter.address||"Dirección a confirmar",voter_phone:(voter.source_data?.telefono||voter.source_data?.phone||null),destination_id:String(destination.id),destination_name:destination.name,destination_address:destination.address||null,driver_user_id:driver.user_id,driver_name:driver.profiles?.full_name||"Chofer",mobilizer_user_id:data.get("mobilizer_user_id")||null,mobilizer_name:members.find(item=>item.user_id===data.get("mobilizer_user_id"))?.profiles?.full_name||null,vehicle_id:data.get("vehicle_id")||null,vehicle_plate:data.get("vehicle_plate")||null,status:"pendiente",status_updated_at:new Date().toISOString(),created_by:"operador"});if(error)setMessage("No se pudo asignar el traslado. Verificá que no esté duplicado.");else{form.reset();setOpen(false);setMessage("Traslado asignado. Ya aparece en el celular del chofer.");await load();}}
 const visible=filter==="todos"?items:items.filter(item=>item.status===filter),count=(status:string)=>items.filter(item=>item.status===status).length;
 return <article className="panel mobility-operator"><PanelHead kicker="DÍA DE ELECCIONES" title="Operativo de movilidad" aside={<button className="primary compact" onClick={()=>setOpen(!open)}>＋ Asignar traslado</button>}/><p className="form-message">Los choferes y movilizadores usan la subapp móvil. Cada avance queda registrado con hora y ubicación.</p><div className="claim-summary"><article><b>{count("pendiente")}</b><span>Pendientes</span></article><article><b>{count("buscada")}</b><span>Buscadas</span></article><article><b>{count("en_destino")}</b><span>En destino</span></article><article><b>{count("regresada")}</b><span>Regresadas</span></article></div>{open&&<form className="entry-form" onSubmit={assign}><div className="form-grid"><label>Fecha del operativo<input name="operation_date" type="date" defaultValue={dateKey(new Date())} required/></label><label>Votante del padrón<select name="voter_id" required><option value="">Elegir persona</option>{voters.map(voter=><option key={voter.id} value={voter.id}>{voter.full_name} · DNI {voter.dni}</option>)}</select></label><label>Chofer<select name="driver_user_id" required><option value="">Elegir chofer</option>{members.filter(member=>member.active).map(member=><option key={member.user_id} value={member.user_id}>{member.profiles?.full_name||"Usuario"}</option>)}</select></label><label>Movilizador acompañante<select name="mobilizer_user_id"><option value="">Sin movilizador</option>{members.filter(member=>member.active).map(member=><option key={member.user_id} value={member.user_id}>{member.profiles?.full_name||"Usuario"}</option>)}</select></label><label>Vehículo<select name="vehicle_id"><option value="">Sin vehículo cargado</option>{vehicles.filter(item=>item.record_type==="Vehículo").map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.title} · {vehicle.contact_phone||"Patente a definir"}</option>)}</select></label><label>Patente<input name="vehicle_plate" placeholder="Ej.: AB 123 CD"/></label><label>Escuela / institución de destino<select name="destination_id" required><option value="">Elegir destino</option>{locations.filter(location=>location.location_type==="escuela"||location.location_type==="sede").map(location=><option key={location.id} value={location.id}>{location.name} · {location.address}</option>)}</select></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Asignar traslado</button></div></form>}<div className="module-actions"><button className={filter==="todos"?"secondary compact":"text-button"} onClick={()=>setFilter("todos")}>Todos {items.length}</button>{(["pendiente","buscada","en_destino","regresada"] as const).map(status=><button key={status} className={filter===status?"secondary compact":"text-button"} onClick={()=>setFilter(status)}>{statusCopy(status)} {count(status)}</button>)}</div>{visible.length===0?<Empty title="Sin traslados asignados" text="Seleccioná votantes del padrón y asignales chofer, vehículo y destino."/>:<div className="campaign-record-list">{visible.map(item=><div key={item.id}><span className={`priority-dot ${item.status==="regresada"?"baja":item.status==="buscada"?"alta":"media"}`}/><div><strong>{item.voter_name}</strong><small>{item.driver_name||"Sin chofer"} · {item.vehicle_plate||"Sin patente"} · {item.destination_name}</small></div><em>{statusCopy(item.status)}</em></div>)}</div>}{message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}</article>;
}
function statusCopy(status:string){return ({pendiente:"Pendiente",buscada:"Buscada",en_destino:"En destino",regresada:"Regresada"} as Record<string,string>)[status]||status;}

function CampaignModuleView({moduleId,user,organization,members,locations,items,voters,reload}:{moduleId:keyof typeof campaignModuleConfig;user:User;organization:Organization;members:Member[];locations:Headquarters[];items:CampaignRecord[];voters:Voter[];reload:()=>Promise<void>}){
  const config=campaignModuleConfig[moduleId],[open,setOpen]=useState(false),[attendanceOpen,setAttendanceOpen]=useState(false),[message,setMessage]=useState(""),[attendance,setAttendance]=useState<EventAttendance[]>([]);
  const pending=items.filter(item=>!["completado","realizado","cerrado","publicado"].includes(item.status)).length;
  useEffect(()=>{if(moduleId!=="eventos")return;void (async()=>{const result=await supabase.from("event_attendance").select("*").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(1000);setAttendance(result.error?[]:(result.data??[]) as EventAttendance[]);})();},[moduleId,organization.id]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from(config.collection).insert({organization_id:organization.id,title:String(data.get("title")||"").trim(),record_type:data.get("record_type")||null,status:data.get("status"),priority:data.get("priority"),responsible_user_id:data.get("responsible_user_id")||null,scheduled_for:data.get("scheduled_for")||null,location:data.get("location")||null,linked_location_id:data.get("linked_location_id")||null,contact_name:data.get("contact_name")||null,contact_phone:data.get("contact_phone")||null,notes:data.get("notes")||null,created_by:user.id});if(error)setMessage(`No se pudo guardar el ${config.singular}.`);else{form.reset();setOpen(false);await reload();}}
  async function addAttendance(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("event_attendance").insert({organization_id:organization.id,event_id:data.get("event_id"),full_name:data.get("full_name"),phone:data.get("phone")||null,neighborhood:data.get("neighborhood")||null,source:"manual",created_by:user.id});if(error)setMessage("No se pudo registrar la asistencia.");else{form.reset();setAttendanceOpen(false);const result=await supabase.from("event_attendance").select("*").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(1000);setAttendance(result.error?[]:(result.data??[]) as EventAttendance[]);}}
  async function changeStatus(id:string,status:string){const {error}=await supabase.from(config.collection).update({status}).eq("id",id).eq("organization_id",organization.id);if(error)setMessage("No se pudo actualizar el estado.");else await reload();}
  const titleForPdf=moduleId==="eventos"?"Eventos y asistencia":moduleId==="logistica"?"Informe de logística":"Informe de fiscalización";
  return <section><ModuleTitle kicker={config.kicker} title={config.title} subtitle={config.subtitle}><div className="module-actions"><PdfButton organization={organization} title={titleForPdf} columns={["Registro","Tipo","Ubicación","Estado","Responsable"]} rows={items.map(item=>[item.title,item.record_type||"-",item.location||"-",item.status,members.find(member=>member.user_id===item.responsible_user_id)?.profiles?.full_name||"-"])}/><BulkTemplateButton file={`modelo-${moduleId}.csv`} label="Excel"/>{moduleId==="eventos"&&<button className="secondary compact" onClick={()=>setAttendanceOpen(!attendanceOpen)}>＋ Asistencia</button>}<button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nuevo</button></div></ModuleTitle>
    <div className="claim-summary"><article><b>{items.length}</b><span>Registros</span></article><article><b>{pending}</b><span>Pendientes</span></article><article><b>{items.filter(item=>item.priority==="urgente"||item.priority==="alta").length}</b><span>Prioridad alta</span></article><article><b>{items.filter(item=>item.responsible_user_id).length}</b><span>Asignados</span></article></div>
    {moduleId==="logistica"&&<MobilityOperator organization={organization} members={members} locations={locations} voters={voters} vehicles={items}/>}
    {open&&<form className="entry-form panel" onSubmit={submit}><div className="form-grid"><label className="wide">Título<input name="title" required maxLength={140}/></label><label>Tipo<select name="record_type">{config.types.map(type=><option key={type}>{type}</option>)}</select></label><label>Estado<select name="status"><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="confirmado">Confirmado</option><option value="completado">Completado</option></select></label><label>Prioridad<select name="priority"><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option><option value="baja">Baja</option></select></label><label>Fecha y hora<input name="scheduled_for" type="datetime-local"/></label><label>Locación<select name="linked_location_id"><option value="">Sin vincular</option>{locations.map(location=><option value={location.id} key={location.id}>{location.name}</option>)}</select></label><label>Lugar / zona<input name="location" maxLength={180}/></label><label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.filter(member=>member.active).map(member=><option value={member.user_id} key={member.user_id}>{member.profiles?.full_name||"Usuario"}</option>)}</select></label>{moduleId!=="eventos"&&<><label>Contacto asignado<input name="contact_name" placeholder={moduleId==="logistica"?"Conductor o movilizador":"Fiscal asignado"}/></label><label>Teléfono<input name="contact_phone" inputMode="tel"/></label></>}<label className="wide">Notas<textarea name="notes" maxLength={1500}/></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Guardar</button></div></form>}
    {attendanceOpen&&moduleId==="eventos"&&<form className="entry-form panel" onSubmit={addAttendance}><div className="form-head"><div><p className="kicker">ASISTENCIA MANUAL</p><h2>Registrar persona</h2></div><button type="button" onClick={()=>setAttendanceOpen(false)}>×</button></div><div className="form-grid"><label>Evento<select name="event_id" required><option value="">Elegir evento</option>{items.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Nombre completo<input name="full_name" required/></label><label>Teléfono<input name="phone" inputMode="tel"/></label><label>Barrio<input name="neighborhood"/></label></div><div className="form-actions"><button type="button" onClick={()=>setAttendanceOpen(false)}>Cancelar</button><button className="primary compact">Registrar asistencia</button></div></form>}
    {moduleId==="eventos"&&<article className="panel"><PanelHead kicker="ASISTENCIA" title="Personas registradas" aside={<PdfButton organization={organization} title="Asistencia a eventos" columns={["Evento","Nombre","Teléfono","Barrio","Origen"]} rows={attendance.map(item=>[items.find(event=>event.id===item.event_id)?.title||"Evento",item.full_name,item.phone||"-",item.neighborhood||"-",item.source])}/>}/>{attendance.length===0?<Empty title="Sin asistencia registrada" text="Podés cargarla manualmente desde este módulo. El enlace público con QR se habilitará al configurar el acceso externo."/>:<div className="campaign-record-list">{attendance.map(item=><div key={item.id}><span className="priority-dot media"/><div><strong>{item.full_name}</strong><small>{items.find(event=>event.id===item.event_id)?.title||"Evento"} · {item.neighborhood||"Sin barrio"}</small></div><em>{item.phone||"Sin teléfono"}</em></div>)}</div>}</article>}
    <article className="panel"><PanelHead kicker="SEGUIMIENTO" title={config.title} aside={`${items.length} registros`}/>{items.length===0?<Empty title={`Sin ${config.singular}s cargados`} text="Usá el botón Nuevo para crear el primer registro."/>:<div className="campaign-record-list">{items.map(item=><div key={item.id}><span className={`priority-dot ${item.priority}`}/><div><strong>{item.title}</strong><small>{item.record_type||config.singular} · {item.location||locations.find(location=>String(location.id)===item.linked_location_id)?.name||"Sin ubicación"} · {item.scheduled_for?new Date(item.scheduled_for).toLocaleString("es-AR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"Sin fecha"}</small></div><em>{members.find(member=>member.user_id===item.responsible_user_id)?.profiles?.full_name||item.contact_name||"Sin responsable"}</em><select value={item.status} onChange={event=>changeStatus(item.id,event.target.value)}><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="confirmado">Confirmado</option><option value="completado">Completado</option></select></div>)}</div>}</article>
    {message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}
  </section>;
}

function AdminView({ profile, organization, organizations, teams, members, referents, auditItems, reloadAll, selectOrganization }: {
  profile: Profile; organization: Organization; organizations: Organization[]; teams: Team[]; members: Member[];
  referents:Referent[];
  auditItems:AuditItem[];
  reloadAll: () => Promise<void>; selectOrganization: (id: string) => void;
}) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [importingUsers, setImportingUsers] = useState(false);
  const [targetOrganizationId,setTargetOrganizationId]=useState(organization.id);
  const [targetTeams,setTargetTeams]=useState<Team[]>(teams);
  const [message, setMessage] = useState("");
  const [generatedLink,setGeneratedLink]=useState("");
  const [authorizations,setAuthorizations]=useState<AuthorizedAccess[]>([]);
  const [adminTab,setAdminTab]=useState<"espacio"|"equipos"|"usuarios"|"enlaces"|"auditoria">("espacio");
  const [publicLinks,setPublicLinks]=useState<PublicLink[]>([]);
  const loadAuthorizations=useCallback(async()=>{const result=await supabase.from("authorized_access").select("*").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(500);setAuthorizations(result.error?[]:(result.data??[]) as AuthorizedAccess[]);},[organization.id]);
  useEffect(()=>{void loadAuthorizations();},[loadAuthorizations]);
  useEffect(()=>{setTargetOrganizationId(organization.id);},[organization.id]);
  useEffect(()=>{void (async()=>{const result=await supabase.from("teams").select("*").eq("organization_id",targetOrganizationId).order("name");setTargetTeams((result.data??[]) as Team[]);})();},[targetOrganizationId]);
  const loadPublicLinks=useCallback(async()=>{const result=await supabase.from("public_links").select("*").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(100);setPublicLinks(result.error?[]:(result.data??[]) as PublicLink[]);},[organization.id]);
  useEffect(()=>{void loadPublicLinks();},[loadPublicLinks]);
  async function createPublicLink(formType:"gestion"|"eventos"|"logistica"|"fiscalizacion"){const id=`${crypto.randomUUID().replaceAll("-","")}${crypto.randomUUID().replaceAll("-","")}`;const {error}=await supabase.from("public_links").insert({id,organization_id:organization.id,module:formType,label:`${formType} · ${organization.candidate_name}`,active:true,expires_at_ms:Date.now()+180*24*60*60*1000,created_by:profile.id});if(error)setMessage("No se pudo crear el enlace.");else{const url=`${window.location.origin}/?public=${id}&form=${formType}`;setGeneratedLink(url);void navigator.clipboard.writeText(url);setMessage("Enlace creado y copiado. Podés enviarlo o convertirlo en QR.");await loadPublicLinks();}}
  async function revokePublicLink(link:PublicLink){const {error}=await supabase.from("public_links").update({active:false}).eq("id",link.id).eq("organization_id",organization.id);setMessage(error?"No se pudo desactivar el enlace.":"Enlace desactivado.");if(!error)await loadPublicLinks();}

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if(teamSaving)return;
    const name=String(data.get("name")??"").trim();
    if(!name)return setMessage("Escribí el nombre del equipo.");
    setTeamSaving(true);setMessage("");
    const { error } = await supabase.from("teams").insert({ organization_id: organization.id, name, description: data.get("description") || null, active:true });
    if (error) setMessage(`No se pudo crear el equipo: ${error.message}`);
    else { form.reset(); setTeamOpen(false); await reloadAll(); setMessage("Equipo creado. Ya está disponible para asignarlo a usuarios."); }
    setTeamSaving(false);
  }

  async function updateMember(userId: string, field: "team_id" | "role", value: string) {
    const { error } = await supabase.from("memberships").update({ [field]: value || null }).eq("organization_id", organization.id).eq("user_id", userId);
    if (error) setMessage("No se pudo actualizar el usuario.");
    else await reloadAll();
  }
  async function toggleModule(member:Member,moduleId:string){
    const defaults=member.role==="coordinacion"?configurableModules.map(([id])=>id):member.role==="territorio"?["sedes","gestion","agenda","eventos"]:member.role==="finanzas"?["presupuesto","agenda","logistica"]:["agenda"];
    const current=member.allowed_modules??defaults;
    const next=current.includes(moduleId)?current.filter(id=>id!==moduleId):[...current,moduleId];
    const {error}=await supabase.from("memberships").update({allowed_modules:next}).eq("organization_id",organization.id).eq("user_id",member.user_id);
    if(error)setMessage("No se pudieron actualizar los permisos.");else await reloadAll();
  }

  async function authorizeMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setAuthorizing(true); setMessage("");
    const role=String(data.get("role")||"territorio") as Role;
    const targetOrganization=String(data.get("organization_id")||organization.id);
    const defaults=role==="coordinacion"?configurableModules.map(([id])=>id):role==="territorio"?["sedes","gestion","agenda","eventos"]:role==="finanzas"?["presupuesto","agenda","logistica"]:["agenda"];
    const email=String(data.get("email")||"").trim().toLowerCase();
    const { error } = await supabase.from("authorized_access").insert({
      id:email, organization_id:targetOrganization,full_name:String(data.get("full_name")||"").trim().slice(0,120),email,team_id:data.get("team_id")||null,role,allowed_modules:(data.getAll("modules").map(String).filter(Boolean).length?data.getAll("modules").map(String):defaults),active:true,created_by:profile.id,created_at:new Date().toISOString(),
    });
    if (error) setMessage("No se pudo autorizar el correo. Verificá que sea correcto.");
    else {
      setMessage("Correo autorizado. La persona ya puede abrir el enlace único y crear su contraseña.");
      form.reset();
      setAuthorizationOpen(false);
      await loadAuthorizations();
    }
    setAuthorizing(false);
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
    const { error } = await supabase.from("memberships").delete().eq("organization_id",organization.id).eq("user_id",member.user_id);
    setMessage(error?"No se pudo retirar el usuario.":"Usuario retirado del espacio.");
    if (!error) await reloadAll();
  }
  async function toggleAuthorization(authorization:AuthorizedAccess){const {error}=await supabase.from("authorized_access").update({active:!authorization.active}).eq("id",authorization.id).eq("organization_id",organization.id);setMessage(error?"No se pudo actualizar la autorización.":authorization.active?"Correo desautorizado.":"Correo habilitado.");if(!error)await loadAuthorizations();}

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const slug = String(data.get("name")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: org, error } = await supabase.from("organizations").insert({
      name: data.get("name"), candidate_name: data.get("candidate_name"),
      position_sought: data.get("position_sought") || null, slug,
    }).select().single();
    if (error || !org) return setMessage("No se pudo crear el espacio político.");
    const { data: team } = await supabase.from("teams").insert({ organization_id: org.id, name: "Equipo central", description: "Coordinación general" }).select().single();
    if (!profile.is_platform_admin) {
      await supabase.from("memberships").insert({ organization_id: org.id, user_id: profile.id, team_id: team?.id ?? null, role: "admin" });
    }
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
  async function importAuthorizedUsers(event: React.ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    if(!file)return;
    setImportingUsers(true);setMessage("");
    try {
      const rows=await readXlsxFile(file);
      const headerIndex=rows.findIndex(row=>row.some(value=>String(value||"").trim().toLowerCase()==="correo"));
      if(headerIndex<0)throw new Error("No encontramos la columna correo.");
      const headers=rows[headerIndex].map(value=>String(value||"").trim().toLowerCase());
      const field=(row:unknown[],name:string)=>String(row[headers.indexOf(name)]??"").trim();
      const acceptedRoles:Role[]=["admin","coordinacion","territorio","finanzas","consulta"];
      let added=0, skipped=0;
      for(const row of rows.slice(headerIndex+1)){
        const email=field(row,"correo").toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){if(row.some(value=>value!==null&&value!==""))skipped++;continue;}
        const active=field(row,"activo").toLowerCase();
        if(["no","false","0","inactivo"].includes(active)){skipped++;continue;}
        const requestedRole=field(row,"rol").toLowerCase() as Role;
        const role=acceptedRoles.includes(requestedRole)?requestedRole:"territorio";
        const space=field(row,"espacio").toLocaleLowerCase("es-AR");
        const target=organizations.find(item=>[item.id,item.name,item.candidate_name,item.slug].some(value=>value.toLocaleLowerCase("es-AR")===space))??organizations.find(item=>item.id===organization.id)!;
        const teamName=field(row,"equipo").toLocaleLowerCase("es-AR");
        const loadedTeams=target.id===organization.id?teams:((await supabase.from("teams").select("*").eq("organization_id",target.id)).data??[]) as Team[];
        const team=loadedTeams.find(item=>item.name.toLocaleLowerCase("es-AR")===teamName);
        const defaults=role==="coordinacion"?configurableModules.map(([id])=>id):role==="territorio"?["sedes","gestion","agenda","eventos"]:role==="finanzas"?["presupuesto","agenda","logistica"]:["agenda"];
        const modules=field(row,"modulos").split(/[,;|]/).map(value=>value.trim().toLowerCase()).filter(value=>configurableModules.some(([id])=>id===value));
        const result=await supabase.from("authorized_access").insert({id:email,organization_id:target.id,full_name:field(row,"nombre_completo")||email,email,team_id:team?.id??null,role,allowed_modules:modules.length?modules:defaults,active:true,created_by:profile.id,created_at:new Date().toISOString()});
        if(result.error)skipped++;else added++;
      }
      await loadAuthorizations();
      setMessage(`Importación terminada: ${added} correos autorizados${skipped?` · ${skipped} filas omitidas o ya existentes`:""}.`);
    }catch{setMessage("No se pudo leer la planilla. Descargá el modelo y no cambies sus encabezados.");}
    finally{event.target.value="";setImportingUsers(false);}
  }
  async function resetMemberPassword(member:Member){const result=await supabase.from("profiles").select("email").eq("id",member.user_id).maybeSingle();const email=String((result.data as {email?:string}|null)?.email||"");if(!email)return setMessage("Este usuario no tiene correo registrado.");const reset=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});setMessage(reset.error?"No se pudo enviar el blanqueo.":`Enlace de blanqueo enviado a ${email}.`);}
  async function loadDemo(){if(!window.confirm("Cargar ejemplos ficticios para la presentación?"))return;const o=organization.id,n=new Date().toISOString();await supabase.from("teams").insert([{organization_id:o,name:"Coordinación Centro",active:true},{organization_id:o,name:"Territorio Norte",active:true}]);await supabase.from("headquarters").insert([{organization_id:o,name:"Sede Centro",address:"San Martín 450",location_type:"sede",active:true,latitude:-26.8305,longitude:-65.2048},{organization_id:o,name:"Club Barrio Norte",address:"Av. Ejército del Norte 1200",location_type:"club",active:true,latitude:-26.813,longitude:-65.217}]);await supabase.from("budget_entries").insert([{organization_id:o,kind:"ingreso",category:"Aportes",description:"Aporte de campaña",amount:250000,occurred_on:"2026-08-01",status:"confirmado"},{organization_id:o,kind:"gasto",category:"Comunicación",description:"Folletos",amount:48000,occurred_on:"2026-08-03",status:"confirmado"}]);await supabase.from("claims").insert({organization_id:o,title:"Iluminación de plaza",description:"Solicitud demostrativa",category:"Alumbrado",priority:"alta",status:"en_proceso",address:"Plaza Barrio Norte",neighborhood:"Barrio Norte",created_at:n});await supabase.from("activities").insert({organization_id:o,title:"Reunión con referentes",activity_type:"reunion",starts_at:"2026-09-05T18:00",status:"programada",location:"Sede Centro",created_at:n});await supabase.from("campaign_events").insert({organization_id:o,title:"Encuentro vecinal",record_type:"Encuentro vecinal",status:"confirmado",priority:"media",scheduled_for:"2026-09-10T19:00",location:"Club Barrio Norte",created_at:n});await supabase.from("logistics_items").insert({organization_id:o,title:"Móvil 01",record_type:"Vehículo",status:"confirmado",priority:"media",contact_name:"Conductor demo",created_at:n});await supabase.from("election_day_assignments").insert({organization_id:o,title:"Escuela demostración",record_type:"Fiscal general",status:"pendiente",priority:"alta",contact_name:"Fiscal demo",created_at:n});await reloadAll();setMessage("Demo ficticia cargada.");}
  async function resetSpace(){if(!window.confirm("Borrar todos los datos operativos de este espacio?"))return;for(const t of ["teams","headquarters","budget_entries","claims","projects","activities","campaign_events","event_attendance","logistics_items","election_day_assignments","public_links"]){const r=await supabase.from(t).select("id").eq("organization_id",organization.id);for(const x of r.data??[])await supabase.from(t).delete().eq("id",x.id);}await reloadAll();setMessage("Datos operativos eliminados.");}

  return <section>
    <ModuleTitle kicker="CONFIGURACIÓN CENTRAL" title="Configuración" subtitle="Configuración ordenada por espacio, equipos, accesos e historial."><div className="module-actions"><button className="secondary compact" onClick={()=>void loadDemo()}>Cargar demo</button><button className="member-delete" onClick={()=>void resetSpace()}>Resetear datos</button></div></ModuleTitle>
    <nav className="admin-tabs" aria-label="Secciones de administración">
      <button className={adminTab==="espacio"?"active":""} onClick={()=>setAdminTab("espacio")}><span>1</span> Espacio político</button>
      <button className={adminTab==="equipos"?"active":""} onClick={()=>setAdminTab("equipos")}><span>2</span> Equipos</button>
      <button className={adminTab==="usuarios"?"active":""} onClick={()=>setAdminTab("usuarios")}><span>3</span> Usuarios y permisos</button>
      <button className={adminTab==="enlaces"?"active":""} onClick={()=>setAdminTab("enlaces")}><span>4</span> Enlaces externos</button>
      <button className={adminTab==="auditoria"?"active":""} onClick={()=>setAdminTab("auditoria")}><span>5</span> Historial</button>
    </nav>
    {adminTab==="espacio"&&<article className="panel admin-section"><PanelHead kicker="MARCA Y LICENCIA" title="Personalización del espacio"/><form className="brand-form" onSubmit={saveBrand}><label>Candidato/a<input name="candidate_name" defaultValue={organization.candidate_name} required/></label><label>Cargo<input name="position_sought" defaultValue={organization.position_sought||""}/></label><label>Color principal<input name="primary_color" type="color" defaultValue={organization.primary_color}/></label><label>Color de acento<input name="accent_color" type="color" defaultValue={organization.accent_color}/></label>{profile.is_platform_admin&&<><label>Plan<select name="plan_name" defaultValue={organization.plan_name||"base"}><option value="base">Base</option><option value="profesional">Profesional</option><option value="campaña">Campaña</option></select></label><label>Licencia<select name="license_status" defaultValue={organization.license_status||"active"}><option value="trial">Prueba</option><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="expired">Vencida</option></select></label></>}<button className="primary compact">Guardar configuración</button></form></article>}
    {adminTab==="espacio"&&profile.is_platform_admin && <article className="panel admin-section">
      <PanelHead kicker="PLATAFORMA MULTICLIENTE" title="Espacios políticos" aside={<button className="text-button" onClick={() => setOrgOpen(!orgOpen)}>＋ Crear espacio</button>} />
      {orgOpen && <form className="inline-form" onSubmit={createOrganization}>
        <input name="name" required placeholder="Nombre del espacio o campaña" />
        <input name="candidate_name" required placeholder="Nombre del candidato/a" />
        <input name="position_sought" placeholder="Cargo al que se postula" />
        <button className="primary compact">Crear</button>
      </form>}
      <div className="org-list">{organizations.map((org) => <button className={org.id === organization.id ? "selected" : ""} onClick={() => selectOrganization(org.id)} key={org.id}><span>{org.candidate_name.slice(0, 1)}</span><div><strong>{org.name}</strong><small>{org.candidate_name} · {org.position_sought || "Cargo no definido"}</small></div><em>{org.active ? "Activo" : "Pausado"}</em></button>)}</div>
    </article>}
    {adminTab==="equipos"&&<div className="admin-single">
      <article className="panel admin-section">
        <PanelHead kicker="ESTRUCTURA" title="Equipos" aside={<button className="text-button" onClick={() => setTeamOpen(!teamOpen)}>＋ Nuevo</button>} />
        {teamOpen && <form className="stack-form" onSubmit={createTeam}><input name="name" required placeholder="Ej.: Equipo Juan Pérez" /><textarea name="description" placeholder="Función o territorio del equipo" /><button className="primary compact">Crear equipo</button></form>}
        <div className="team-list">{teams.map((team) => {const accessUsers=members.filter(member=>member.team_id===team.id).length,fieldWorkers=referents.filter(referent=>referent.team_id===team.id&&referent.status==="activo").length;return <div key={team.id}><span>{team.name.slice(0, 2).toUpperCase()}</span><div><strong>{team.name}</strong><small>{team.description || "Sin descripción"}</small></div><em>{accessUsers+fieldWorkers} personas · {fieldWorkers} en territorio</em></div>})}</div>
      </article>
    </div>}
    {adminTab==="usuarios"&&<div className="admin-single">
      <article className="panel admin-section">
        <PanelHead kicker="PERSONAS Y PERMISOS" title="Usuarios" aside={<div className="user-tools"><a className="text-button" href="/plantilla-carga-usuarios.xlsx" download>↓ Modelo Excel</a><label className="text-button">{importingUsers?"Importando...":"↑ Carga masiva"}<input hidden type="file" accept=".xlsx" disabled={importingUsers} onChange={event=>void importAuthorizedUsers(event)}/></label><button className="text-button" onClick={() => setAuthorizationOpen(!authorizationOpen)}>＋ Autorizar correo</button></div>} />
        <p className="form-message">Un solo enlace para todos: cada persona ingresa su correo, crea su clave una vez y sólo accede si este correo fue autorizado aquí.</p>
        {authorizationOpen && <form className="invite-form" onSubmit={authorizeMember}>
          <div><label>Nombre completo<input name="full_name" required placeholder="Ana Páez" /></label><label>Correo electrónico<input name="email" required type="email" placeholder="ana@correo.com" /></label></div>
          <div><label>Espacio político<select name="organization_id" value={targetOrganizationId} onChange={event=>setTargetOrganizationId(event.target.value)}>{organizations.map(item=><option value={item.id} key={item.id}>{item.name} · {item.candidate_name}</option>)}</select></label><label>Equipo<select name="team_id"><option value="">Sin equipo</option>{targetTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label></div>
          <div><label>Rol<select name="role" defaultValue="territorio">{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Módulos habilitados<span className="module-permissions">{configurableModules.map(([id,label])=><label key={id}><input name="modules" type="checkbox" value={id} defaultChecked={["sedes","gestion","agenda","eventos"].includes(id)}/>{label}</label>)}</span></label></div>
          <div className="invite-actions"><button type="button" onClick={() => setAuthorizationOpen(false)}>Cancelar</button><button className="primary compact" disabled={authorizing}>{authorizing ? "Autorizando..." : "Autorizar correo"}</button></div>
        </form>}
        {authorizations.length>0&&<div className="invitation-list">{authorizations.map(authorization=><div key={authorization.id}><span>{authorization.full_name.slice(0,1).toUpperCase()}</span><div><strong>{authorization.full_name}</strong><small>{authorization.email} · {authorization.active?"Autorizado":"Desactivado"}</small></div><em>{teams.find(team=>team.id===authorization.team_id)?.name||"Sin equipo"}</em><button className={`member-toggle ${authorization.active?"deactivate":"activate"}`} onClick={()=>void toggleAuthorization(authorization)}>{authorization.active?"Desactivar":"Activar"}</button></div>)}</div>}
        <div className="member-list">{members.map((member) => <div className={!member.active ? "member-disabled" : ""} key={member.user_id}>
          <span className="avatar">{(member.profiles?.full_name ?? "U").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><strong>{member.profiles?.full_name}</strong><small>{member.active ? "Usuario habilitado" : "Acceso desactivado"}</small></div>
          <select aria-label="Equipo" disabled={!member.active} value={member.team_id ?? ""} onChange={(e) => updateMember(member.user_id, "team_id", e.target.value)}><option value="">Sin equipo</option>{teams.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select>
          <select aria-label="Rol" disabled={!member.active} value={member.role} onChange={(e) => updateMember(member.user_id, "role", e.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <div className="member-actions"><button className="text-button" onClick={()=>void resetMemberPassword(member)}>Blanquear clave</button><button className={`member-toggle ${member.active ? "deactivate" : "activate"}`} disabled={member.user_id === profile.id} onClick={() => toggleMember(member)}>{member.active ? "Desactivar" : "Activar"}</button><button className="member-delete" disabled={member.user_id === profile.id} onClick={() => removeMember(member)}>Borrar</button></div>
          {member.role!=="admin"&&<div className="module-permissions">{configurableModules.map(([id,label])=><label key={id}><input type="checkbox" checked={(member.allowed_modules??(member.role==="coordinacion"?configurableModules.map(([x])=>x):member.role==="territorio"?["sedes","gestion","agenda","eventos"]:member.role==="finanzas"?["presupuesto","agenda","logistica"]:["agenda"])).includes(id)} onChange={()=>toggleModule(member,id)}/>{label}</label>)}</div>}
        </div>)}</div>
        <div className="info-banner compact-info">Los correos autorizados pueden usar siempre el mismo enlace: <strong>{typeof window!=="undefined"?window.location.origin:""}</strong>. Cada usuario crea su contraseña una sola vez y recibe solamente los módulos habilitados.</div>
      </article>
      <article className="panel admin-section">
        <PanelHead kicker="EQUIPO OPERATIVO" title="Colaboradores de campo" aside={`${referents.length} personas`}/>
        <div className="field-worker-grid">{referents.map(referent=><div key={referent.id}><span>{referent.full_name.split(/\s+/).map(part=>part[0]).join("").slice(0,2)}</span><div><strong>{referent.full_name}</strong><small>{teams.find(team=>team.id===referent.team_id)?.name||"Sin equipo"} · {referent.referent_type}</small></div><em>{referent.status}</em></div>)}</div>
        <div className="info-banner compact-info">Los colaboradores no necesitan acceso a la app. Se administran desde Territorio y quedan vinculados a un equipo, sede y zona.</div>
      </article>
    </div>}
    {adminTab==="enlaces"&&<article className="panel admin-section"><PanelHead kicker="FORMULARIOS SIN CUENTA" title="Enlaces externos"/><p className="form-message">Cada enlace habilita únicamente un formulario y vence a los 180 días. Podés desactivarlo cuando termine la actividad.</p><div className="module-actions"><button className="primary compact" onClick={()=>void createPublicLink("gestion")}>＋ Reclamos vecinales</button><button className="primary compact" onClick={()=>void createPublicLink("eventos")}>＋ Asistencia a evento</button><button className="primary compact" onClick={()=>void createPublicLink("logistica")}>＋ Reporte de móvil</button><button className="primary compact" onClick={()=>void createPublicLink("fiscalizacion")}>＋ Reporte fiscal</button></div>{generatedLink&&<div className="generated-invite"><input readOnly value={generatedLink}/><button className="primary compact" onClick={()=>void navigator.clipboard.writeText(generatedLink)}>Copiar</button><LinkQr value={generatedLink}/></div>}<div className="invitation-list">{publicLinks.map(link=><div key={link.id}><span>↗</span><div><strong>{link.label||link.module}</strong><small>{link.active?"Activo":"Desactivado"} · vence {new Date(link.expires_at_ms).toLocaleDateString("es-AR")}</small></div>{link.active&&<><button onClick={()=>{const url=`${window.location.origin}/?public=${link.id}&form=${link.module}`;setGeneratedLink(url);void navigator.clipboard.writeText(url);setMessage("Enlace copiado.");}}>Copiar / QR</button><button className="member-delete" onClick={()=>void revokePublicLink(link)}>Desactivar</button></>}</div>)}</div></article>}
    {adminTab==="auditoria"&&<article className="panel admin-section"><PanelHead kicker="SEGURIDAD Y TRAZABILIDAD" title="Actividad reciente" aside={`${auditItems.length} cambios`}/>{auditItems.length===0?<Empty title="Sin cambios para mostrar" text="Las nuevas modificaciones de usuarios, reclamos, proyectos y territorio aparecerán aquí."/>:<div className="audit-list">{auditItems.map(item=><div key={item.id}><span>{item.action.slice(0,1).toUpperCase()}</span><div><strong>{item.entity_type}</strong><small>{item.action} · registro {item.entity_id}</small></div><time>{new Date(item.created_at).toLocaleString("es-AR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>)}</div>}</article>}
    {message && <button className="toast" onClick={() => setMessage("")}>{message}<span>×</span></button>}
  </section>;
}

function DashboardMetricCard({
  tone,
  icon,
  title,
  eyebrow,
  value,
  detail,
  helper,
  badge,
  progress,
  action,
  onClick,
}: {
  tone: "blue" | "green" | "violet" | "amber";
  icon: string;
  title: string;
  eyebrow: string;
  value: string;
  detail: string;
  helper: string;
  badge: string;
  progress?: number;
  action: string;
  onClick: () => void;
}) {
  const safeProgress = Math.max(0, Math.min(100, progress ?? 0));
  return <article className={`stat-card ${tone}`}>
    <div className="stat-heading">
      <div className="card-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <span className="metric-badge">{badge}</span>
    </div>
    <p>{eyebrow}</p>
    <strong>{value}</strong>
    <span>{detail}</span>
    <div className="metric-spark" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
    {progress !== undefined && <div className="metric-progress" aria-label={`${Math.round(safeProgress)} por ciento`}>
      <i style={{ width: `${safeProgress}%` }}/>
      <small>{Math.round(safeProgress)}%</small>
    </div>}
    <small>{helper}</small>
    <button onClick={onClick}>{action}<span aria-hidden="true">→</span></button>
  </article>;
}

function HomeDashboard({ organization, organizations, canAdmin, selectOrganization, teams, members, headquarters, entries, claims, projects, activities, referents, voters, go }: {
  organization: Organization; organizations: Organization[]; canAdmin: boolean; selectOrganization: (id: string) => void;
  teams: Team[]; members: Member[]; headquarters: Headquarters[]; entries: BudgetEntry[]; claims:Claim[]; projects:Project[]; activities:Activity[]; referents:Referent[]; voters:Voter[]; go: (id: string) => void;
}) {
  const [selectedDate,setSelectedDate]=useState(dateKey(new Date()));
  const totals = entries.reduce((acc, item) => { if (item.status !== "cancelado") acc[item.kind] += Number(item.amount); return acc; }, { ingreso: 0, gasto: 0, compromiso: 0 });
  const target = new Date();
  const year = target.getMonth() > 4 || (target.getMonth() === 4 && target.getDate() > 9) ? target.getFullYear() + 1 : target.getFullYear();
  const days = Math.max(0, Math.ceil((new Date(year, 4, 9).getTime() - target.getTime()) / 86400000));
  const dayActivities=activitiesForDate(activities,selectedDate);
  const selectedLabel=new Date(`${selectedDate}T12:00:00`).toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  const activeWorkers=members.filter(member=>member.active).length+referents.filter(referent=>referent.status==="activo").length;
  const totalWorkers=members.length+referents.length;
  const contactedVoters=voters.filter(voter=>voter.contact_status!=="sin_contactar").length;
  const urgentClaims=claims.filter(claim=>claim.priority==="urgente"&&!["resuelto","cerrado"].includes(claim.status)).length;
  const activeProjects=projects.filter(project=>!["completado","cancelado"].includes(project.status)).length;
  const workerRate=totalWorkers?activeWorkers/totalWorkers*100:0;
  const voterRate=voters.length?contactedVoters/voters.length*100:0;
  const budgetUse=totals.ingreso?(totals.gasto+totals.compromiso)/totals.ingreso*100:0;
  const todayLabel=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  return <>
    <section className={`hero-row ${isNagleWorkspace(organization)?"nagle-hero":""}`}>
      {isNagleWorkspace(organization)&&<img className="nagle-portrait" src="/ernesto-nagle.png" alt="Ernesto Nagle" width={220} height={270}/>}
      <div className="hero-copy">
        <div className="hero-status"><i/> OPERACIÓN EN CURSO <span>{todayLabel}</span></div>
        <p className="kicker">CENTRO DE OPERACIONES</p>
        <h1>{organization.candidate_name}</h1>
        <span>{organization.name} · {organization.position_sought}</span>
        <div className="hero-chips">
          <b>{activeWorkers} personas activas</b>
          <b>{urgentClaims} urgencias</b>
          <b>{activeProjects} proyectos en marcha</b>
        </div>
      </div>
      <div className="countdown"><span>CUENTA REGRESIVA</span><strong>{days}</strong><b>DÍAS</b><small>HASTA EL 9 DE MAYO</small></div>
    </section>
    {canAdmin && organizations.length > 1 && <div className="home-organization-switch"><label htmlFor="home-organization">Espacio político activo</label><select id="home-organization" value={organization.id} onChange={(e) => selectOrganization(e.target.value)}>{organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select></div>}
    <section className="stats-grid home-kpis">
      <DashboardMetricCard tone="blue" icon="◎" title="Equipo operativo" eyebrow="PERSONAS ACTIVAS" value={String(activeWorkers)} detail={`${teams.length} equipos organizados`} helper="Usuarios y colaboradores territoriales" badge="EQUIPO" progress={workerRate} action="Ver organización" onClick={() => go("admin")}/>
      <DashboardMetricCard tone="green" icon="⌂" title="Cobertura territorial" eyebrow="LOCACIONES ACTIVAS" value={String(headquarters.length)} detail={`${new Set(referents.map(item=>item.neighborhood).filter(Boolean)).size} barrios con referentes`} helper="Mapa y ubicaciones actualizados" badge="MAPA" action="Abrir locaciones" onClick={() => go("sedes")}/>
      <DashboardMetricCard tone="violet" icon="◉" title="Base electoral" eyebrow="VOTANTES DEMO" value={String(voters.length)} detail={`${contactedVoters} contactos trabajados`} helper="Ejemplo ficticio listo para presentar" badge="PADRÓN" progress={voterRate} action="Explorar votantes" onClick={() => go("votantes")}/>
      <DashboardMetricCard tone="amber" icon="$" title="Recursos de campaña" eyebrow="SALDO PROYECTADO" value={money.format(totals.ingreso - totals.gasto - totals.compromiso)} detail={`${entries.length} movimientos registrados`} helper="Ingresos, gastos y compromisos" badge="CONTROL" progress={budgetUse} action="Ver presupuesto" onClick={() => go("presupuesto")}/>
    </section>
    <section className="home-agenda-grid">
      <article className="panel calendar-panel"><PanelHead kicker="CALENDARIO INTERACTIVO" title={new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"})} aside="Elegí un día"/><MonthCalendar activities={activities} selectedDate={selectedDate} onSelectDate={setSelectedDate}/></article>
      <article className="panel selected-agenda">
        <PanelHead kicker="AGENDA DEL DÍA" title={selectedLabel} aside={<button className="text-button" onClick={()=>go("agenda")}>Gestionar agenda</button>}/>
        {dayActivities.length===0?<Empty title="No hay actividades" text="Este día está libre. Podés abrir Agenda y cargar una visita, reunión, recorrida o evento."/>:<div className="day-agenda-list">{dayActivities.map(activity=><button key={activity.id} onClick={()=>go("agenda")}><time>{new Date(activity.starts_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</time><span><strong>{activity.title}</strong><small>{activity.location||"Lugar a definir"} · {activity.status}</small></span></button>)}</div>}
        <div className="campaign-pulse">
          <div><b>{claims.filter(claim=>!["resuelto","cerrado"].includes(claim.status)).length}</b><span>reclamos pendientes</span></div>
          <div><b>{projects.filter(project=>!["completado","cancelado"].includes(project.status)).length}</b><span>proyectos activos</span></div>
        </div>
      </article>
    </section>
    <section className="quick-section"><div><p className="kicker">ACCESOS RÁPIDOS</p><h2>¿Qué necesitás hacer?</h2></div><div className="quick-grid">
      <button onClick={() => go("admin")}><span>⚙</span><b>Configurar equipos</b><small>Personas, roles y espacios</small></button>
      <button onClick={() => go("sedes")}><span>⌂</span><b>Cargar locación</b><small>Asignar tipo, equipo y responsable</small></button>
      <button onClick={() => go("presupuesto")}><span>$</span><b>Registrar movimiento</b><small>Ingreso, gasto o compromiso</small></button>
      <button onClick={() => go("gestion")}><span>!</span><b>Gestionar reclamos</b><small>Proyectos y necesidades vecinales</small></button>
    </div></section>
  </>;
}

function MonthCalendar({activities,selectedDate,onSelectDate}:{activities:Activity[];selectedDate:string;onSelectDate:(date:string)=>void}){
  const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),offset=(first.getDay()+6)%7;
  return <div className="month-calendar"><div className="calendar-week">{["L","M","X","J","V","S","D"].map(d=><b key={d}>{d}</b>)}</div><div className="calendar-days">{Array.from({length:offset},(_,i)=><span key={`e${i}`}/>) }{Array.from({length:days},(_,i)=>{const day=i+1,key=dateKey(new Date(now.getFullYear(),now.getMonth(),day)),has=activitiesForDate(activities,key).length>0;return <button type="button" aria-label={`${day} de ${now.toLocaleDateString("es-AR",{month:"long"})}${has?", con actividades":", sin actividades"}`} aria-pressed={selectedDate===key} onClick={()=>onSelectDate(key)} className={`${day===now.getDate()?"today":""} ${has?"has-event":""} ${selectedDate===key?"selected":""}`} key={day}>{day}</button>})}</div></div>;
}

function AgendaView({user,organization,teams,members,headquarters,items,reload}:{user:User;organization:Organization;teams:Team[];members:Member[];headquarters:Headquarters[];items:Activity[];reload:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState(""),[selectedDate,setSelectedDate]=useState(dateKey(new Date()));
 const selectedItems=activitiesForDate(items,selectedDate);
 const selectedLabel=new Date(`${selectedDate}T12:00:00`).toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("activities").insert({organization_id:organization.id,title:data.get("title"),activity_type:data.get("activity_type"),description:data.get("description")||null,starts_at:data.get("starts_at"),ends_at:data.get("ends_at")||null,location:data.get("location")||null,headquarters_id:data.get("headquarters_id")||null,team_id:data.get("team_id")||null,responsible_user_id:data.get("responsible_user_id")||null,created_by:user.id});if(error)setMessage("No se pudo guardar la actividad.");else{form.reset();setOpen(false);await reload();}}
 async function status(id:number,value:string){const {error}=await supabase.from("activities").update({status:value,updated_at:new Date().toISOString()}).eq("id",id);if(error)setMessage("No se pudo actualizar la actividad.");else await reload();}
 return <section>
   <ModuleTitle kicker="ORGANIZACIÓN DIARIA" title="Agenda y actividades" subtitle="Elegí un día para consultar o cargar reuniones, recorridas, eventos y visitas."><button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nueva actividad</button></ModuleTitle>
   {open&&<form className="entry-form panel" onSubmit={submit}><div className="form-head"><div><p className="kicker">NUEVA ACTIVIDAD</p><h2>{selectedLabel}</h2></div><button type="button" onClick={()=>setOpen(false)}>×</button></div><div className="form-grid"><label className="wide">Título<input name="title" required/></label><label>Tipo<select name="activity_type"><option value="reunion">Reunión</option><option value="recorrida">Recorrida</option><option value="evento">Evento</option><option value="capacitacion">Capacitación</option><option value="visita">Visita</option><option value="tarea">Tarea</option></select></label><label>Lugar<input name="location"/></label><label>Inicio<input type="datetime-local" name="starts_at" defaultValue={`${selectedDate}T10:00`} required/></label><label>Fin<input type="datetime-local" name="ends_at" defaultValue={`${selectedDate}T11:30`}/></label><label>Sede<select name="headquarters_id"><option value="">Sin sede</option>{headquarters.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Equipo<select name="team_id"><option value="">Todos</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Responsable<select name="responsible_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label><label className="wide">Descripción<textarea name="description"/></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Guardar actividad</button></div></form>}
   <div className="agenda-layout">
     <article className="panel calendar-panel"><PanelHead kicker="CALENDARIO MENSUAL" title={new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"})} aside="Seleccioná una fecha"/><MonthCalendar activities={items} selectedDate={selectedDate} onSelectDate={setSelectedDate}/></article>
     <article className="panel selected-agenda"><PanelHead kicker="AGENDA DEL DÍA" title={selectedLabel} aside={`${selectedItems.length} actividades`}/>
       {selectedItems.length===0?<Empty title="No hay nada agendado" text="Este día está libre. Usá “Nueva actividad” para cargar una visita, reunión o evento."/>:<div className="activity-list">{selectedItems.map(a=><div key={a.id}><time>{new Date(a.starts_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</time><div><strong>{a.title}</strong><small>{a.activity_type} · {a.location||"Sin lugar"}</small></div><select value={a.status} onChange={e=>void status(a.id,e.target.value)}><option value="programada">Programada</option><option value="confirmada">Confirmada</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option></select></div>)}</div>}
     </article>
   </div>
   <article className="panel agenda-upcoming"><PanelHead kicker="PRÓXIMAS FECHAS" title="Cronograma general" aside={`${items.length} registros`}/>{items.length===0?<Empty title="Sin actividades" text="Agregá la primera reunión o recorrida."/>:<div className="activity-list">{items.filter(item=>new Date(item.starts_at)>=new Date()).slice(0,8).map(a=><div key={a.id}><time>{new Date(a.starts_at).toLocaleDateString("es-AR",{day:"2-digit",month:"short"})}</time><div><strong>{a.title}</strong><small>{new Date(a.starts_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})} · {a.location||"Sin lugar"}</small></div><select value={a.status} onChange={e=>void status(a.id,e.target.value)}><option value="programada">Programada</option><option value="confirmada">Confirmada</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option></select></div>)}</div>}</article>
   {message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}
 </section>;
}

function TerritoryView({user,organization,teams,members,headquarters,items,reload}:{user:User;organization:Organization;teams:Team[];members:Member[];headquarters:Headquarters[];items:Referent[];reload:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const {error}=await supabase.from("territorial_referents").insert({organization_id:organization.id,full_name:data.get("full_name"),phone:data.get("phone")||null,email:data.get("email")||null,referent_type:data.get("referent_type"),neighborhood:data.get("neighborhood")||null,circuit:data.get("circuit")||null,zone:data.get("zone")||null,headquarters_id:data.get("headquarters_id")||null,team_id:data.get("team_id")||null,reports_to_user_id:data.get("reports_to_user_id")||null,influence_level:data.get("influence_level"),notes:data.get("notes")||null,latitude:data.get("latitude")||null,longitude:data.get("longitude")||null,created_by:user.id});if(error)setMessage("No se pudo guardar el referente.");else{form.reset();setOpen(false);await reload();}}
 async function status(id:number,value:string){const {error}=await supabase.from("territorial_referents").update({status:value,updated_at:new Date().toISOString()}).eq("id",id);if(error)setMessage("No se pudo actualizar el referente.");else await reload();}
 return <section className="territory-network"><div className="territory-network-head"><div><p className="kicker">RED TERRITORIAL</p><h2>Referentes y dirigentes</h2><span>Cobertura por barrios, circuitos, sedes y equipos.</span></div><button className="primary compact" onClick={()=>setOpen(!open)}>＋ Nuevo referente</button></div><div className="claim-summary"><article><b>{items.filter(i=>i.status==="activo").length}</b><span>Activos</span></article><article><b>{new Set(items.map(i=>i.neighborhood).filter(Boolean)).size}</b><span>Barrios cubiertos</span></article><article><b>{items.filter(i=>i.referent_type==="dirigente").length}</b><span>Dirigentes</span></article><article><b>{items.filter(i=>i.influence_level==="alto").length}</b><span>Alcance alto</span></article></div>{open&&<form className="entry-form panel" onSubmit={submit}><div className="form-grid"><label className="wide">Nombre completo<input name="full_name" required/></label><label>Tipo<select name="referent_type"><option value="referente">Referente</option><option value="dirigente">Dirigente</option><option value="puntero">Puntero</option><option value="colaborador">Colaborador</option></select></label><label>Alcance<select name="influence_level"><option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option></select></label><label>Teléfono<input name="phone"/></label><label>Correo<input type="email" name="email"/></label><label>Barrio<input name="neighborhood"/></label><label>Circuito<input name="circuit"/></label><label>Zona<input name="zone"/></label><label>Sede<select name="headquarters_id"><option value="">Sin sede</option>{headquarters.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Equipo<select name="team_id"><option value="">Sin equipo</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Responsable político<select name="reports_to_user_id"><option value="">Sin asignar</option>{members.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>)}</select></label><label className="wide">Notas<textarea name="notes"/></label></div><div className="form-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary compact">Guardar referente</button></div></form>}<article className="panel"><PanelHead kicker="EQUIPO DE CAMPO" title="Personas registradas" aside={`${items.length} personas`}/>{items.length===0?<Empty title="Sin referentes registrados" text="Agregá dirigentes y colaboradores para visualizar la cobertura territorial."/>:<div className="referent-list">{items.map(r=><div key={r.id}><span>{r.full_name.split(/\s+/).map(x=>x[0]).join("").slice(0,2)}</span><div><strong>{r.full_name}</strong><small>{r.referent_type} · {r.neighborhood||r.zone||"Zona sin definir"} · {r.phone||"Sin teléfono"}</small></div><em>{r.influence_level}</em><select value={r.status} onChange={e=>status(r.id,e.target.value)}><option value="activo">Activo</option><option value="pausado">Pausado</option><option value="desvinculado">Desvinculado</option></select></div>)}</div>}</article>{message&&<button className="toast" onClick={()=>setMessage("")}>{message}<span>×</span></button>}</section>;
}

function ModuleTitle({ kicker, title, subtitle, children }: { kicker: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return <><div className="module-title"><div><p className="kicker">{kicker}</p><h1>{title}</h1><span>{subtitle}</span></div></div>{children&&<div className="module-title-actions">{children}</div>}</>;
}
function PanelHead({ kicker, title, aside }: { kicker: string; title: string; aside?: React.ReactNode }) {
  return <div className="panel-head"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div>{aside && <span>{aside}</span>}</div>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><b>{title}</b><span>{text}</span></div>; }
function MoneyCard({ label, value, tone }: { label: string; value: number; tone: string }) { return <article className={`money-card ${tone}`}><p>{label}</p><strong>{money.format(value)}</strong><span>Valores del espacio seleccionado</span></article>; }

function Dashboard({ session, profile }: { session: Session; profile: Profile }) {
  const [currentTime] = useState(() => Date.now());
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
  const [voters,setVoters]=useState<Voter[]>([]);
  const [voterImports, setVoterImports] = useState<VoterImport[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [notificationReads,setNotificationReads]=useState<NotificationRead[]>([]);
  const [campaignRecords,setCampaignRecords]=useState<Record<keyof typeof campaignModuleConfig,CampaignRecord[]>>({eventos:[],logistica:[],fiscalizacion:[]});
  const [menuOpen,setMenuOpen]=useState(false);
  const [bellOpen,setBellOpen]=useState(false);
  const [notice, setNotice] = useState("");
  const [contextLoading,setContextLoading]=useState(true);
  const organization = organizations.find((org) => org.id === organizationId) ?? organizations[0];
  const membership = members.find((member) => member.user_id === profile.id);
  const orgRole: Role = membership?.role ?? (profile.is_platform_admin ? "admin" : profile.role);
  const canFinance = profile.is_platform_admin || ["admin", "coordinacion", "finanzas"].includes(orgRole);
  const canAdmin = profile.is_platform_admin || orgRole === "admin";

  const loadOrganizations = useCallback(async () => {
    let list:Organization[]=[];
    if(profile.is_platform_admin){
      const result=await supabase.from("organizations").select("*").order("name");
      list=(result.data??[]) as Organization[];
    }else{
      const membershipResult=await supabase.from("memberships").select("organization_id,active").eq("user_id",profile.id);
      const organizationIds=[...new Set(((membershipResult.data??[]) as {organization_id:string;active?:boolean}[]).filter(item=>item.active!==false).map(item=>item.organization_id))];
      const results=await Promise.all(organizationIds.map(id=>supabase.from("organizations").select("*").eq("id",id).maybeSingle()));
      list=results.map(result=>result.data as Organization|null).filter((item):item is Organization=>Boolean(item&&item.active));
    }
    list.sort((left,right)=>left.name.localeCompare(right.name,"es")); setOrganizations(list);
    const requested=new URLSearchParams(window.location.search).get("workspace");
    setOrganizationId((current) => current && list.some((org) => org.id === current) ? current : list.find(org=>org.id===requested)?.id ?? list[0]?.id ?? "");
    if(list.length===0)setContextLoading(false);
  }, [profile.is_platform_admin]);
  const loadContext = useCallback(async () => {
    if (!organizationId) return;
    const [teamResult, memberResult, sedeResult, budgetResult, claimResult, projectResult, proposalResult, activityResult, referentResult,voterResult,importResult,auditResult,notificationReadResult,...campaignResults] = await Promise.all([
      supabase.from("teams").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("memberships").select("organization_id,user_id,team_id,role,active,allowed_modules,profiles(id,full_name,active)").eq("organization_id", organizationId),
      supabase.from("headquarters").select("id,name,address,circuit,phone,team_id,responsible_user_id,active,latitude,longitude,location_type").eq("organization_id", organizationId).eq("active", true).order("name"),
      supabase.from("budget_entries").select("id,kind,category,description,amount,occurred_on,status,payment_method").eq("organization_id", organizationId).order("occurred_on", { ascending: false }).limit(100),
      supabase.from("claims").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("projects").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("proposals").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("activities").select("*").eq("organization_id",organizationId).order("starts_at",{ascending:true}).limit(300),
      supabase.from("territorial_referents").select("*").eq("organization_id",organizationId).order("full_name").limit(500),
      supabase.from("voters").select("id,dni,full_name,address,circuit,polling_place,contact_status,assigned_to,source_data").eq("organization_id",organizationId).order("full_name").limit(500),
      supabase.from("voter_imports").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(25),
      supabase.from("audit_log").select("id,entity_type,entity_id,action,details,created_at,actor_id").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(50),
      supabase.from("notification_reads").select("*").eq("user_id",profile.id).limit(500),
      ...Object.values(campaignModuleConfig).map(config=>supabase.from(config.collection).select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(300)),
    ]);
    setTeams(((teamResult.data ?? []) as Team[]).filter(team=>team.active!==false));
    setMembers((memberResult.data ?? []) as unknown as Member[]);
    setHeadquarters((sedeResult.data ?? []) as Headquarters[]);
    setEntries(budgetResult.error ? [] : (budgetResult.data ?? []) as BudgetEntry[]);
    setClaims(claimResult.error?[]:(claimResult.data??[]) as Claim[]);
    setProjects(projectResult.error?[]:(projectResult.data??[]) as Project[]);
    setProposals(proposalResult.error?[]:(proposalResult.data??[]) as Proposal[]);
    setActivities(activityResult.error?[]:(activityResult.data??[]) as Activity[]);
    setReferents(referentResult.error?[]:(referentResult.data??[]) as Referent[]);
    setVoters(voterResult.error?[]:(voterResult.data??[]) as Voter[]);
    setVoterImports(importResult.error?[]:(importResult.data??[]) as VoterImport[]);
    setAuditItems(auditResult.error?[]:(auditResult.data??[]) as AuditItem[]);
    setNotificationReads(notificationReadResult.error?[]:((notificationReadResult.data??[]) as NotificationRead[]).filter(item=>item.organization_id===organizationId));
    const campaignKeys=Object.keys(campaignModuleConfig) as (keyof typeof campaignModuleConfig)[];
    setCampaignRecords(Object.fromEntries(campaignKeys.map((key,index)=>[key,campaignResults[index]?.error?[]:(campaignResults[index]?.data??[]) as CampaignRecord[]])) as Record<keyof typeof campaignModuleConfig,CampaignRecord[]>);
    setContextLoading(false);
  }, [organizationId,profile.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrganizations(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrganizations]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadContext(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  async function reloadAll() { await loadOrganizations(); await loadContext(); }
  const allModules = [{ id: "inicio", label: "Inicio", icon: "⌂" },{ id: "votantes", label: "Votantes", icon: "◎" },{ id: "sedes", label: "Locaciones", icon: "◇" },{ id: "presupuesto", label: "Presupuesto", icon: "$" },{ id: "gestion", label: "Gestión", icon: "!" },{ id: "agenda", label: "Agenda", icon: "▣" },{ id: "eventos", label: "Eventos", icon: "◉" },{ id: "logistica", label: "Logística", icon: "▤" },{ id: "fiscalizacion", label: "Fiscalización", icon: "⚑" },...(canAdmin ? [{ id: "admin", label: "Configuración", icon: "⚙" }] : [])];
  const modules=allModules.filter(item=>item.id==="inicio"||item.id==="admin"||profile.is_platform_admin||orgRole==="admin"||(membership?.allowed_modules??(orgRole==="coordinacion"?configurableModules.map(([id])=>id):orgRole==="territorio"?["sedes","gestion","agenda"]:orgRole==="finanzas"?["presupuesto","agenda"]:["agenda"])).includes(item.id));
  function go(id: string) {
    if (id === "presupuesto" && !canFinance) return setNotice("Tu rol no tiene acceso al presupuesto.");
    if (id === "admin" && !canAdmin) return setNotice("Tu rol no tiene acceso a Configuración.");
    if(!modules.some(module=>module.id===id))return setNotice("No tenés permiso para acceder a este módulo.");
    setActive(id);setMenuOpen(false);
  }
  if (contextLoading) return <Splash/>;
  if (!organization) return <main className="access-state"><Logo /><h1>Acceso pendiente de verificación</h1><p>Tu correo todavía no está vinculado a un espacio político. Comunicate con el referente de tu campaña para que lo autorice indicando espacio, equipo y funciones.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;

  const initials = profile.full_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const notifications=[
    ...claims.filter(c=>c.priority==="urgente"&&!["resuelto","cerrado"].includes(c.status)).map(c=>({id:`c${c.id}`,title:"Reclamo urgente",text:c.title,module:"gestion"})),
    ...projects.filter(p=>p.due_date&&new Date(`${p.due_date}T23:59:59`).getTime()<currentTime&&!["completado","cancelado"].includes(p.status)).map(p=>({id:`p${p.id}`,title:"Proyecto vencido",text:p.name,module:"gestion"})),
    ...activities.filter(a=>{const diff=new Date(a.starts_at).getTime()-currentTime;return diff>=0&&diff<=86400000&&!["realizada","cancelada"].includes(a.status)}).map(a=>({id:`a${a.id}`,title:"Actividad próxima",text:a.title,module:"agenda"})),
  ].slice(0,20);
  const readIds=new Set(notificationReads.map(item=>item.notification_id));
  const unreadNotifications=notifications.filter(item=>!readIds.has(item.id));
  async function markNotificationRead(notificationId:string){
    if(readIds.has(notificationId))return;
    await supabase.from("notification_reads").insert({id:`${organization.id}_${profile.id}_${notificationId}`,organization_id:organization.id,user_id:profile.id,notification_id:notificationId,read_at:new Date().toISOString()});
    setNotificationReads(current=>[...current,{id:`${organization.id}_${profile.id}_${notificationId}`,organization_id:organization.id,user_id:profile.id,notification_id:notificationId,read_at:new Date().toISOString()}]);
  }
  async function markAllNotificationsRead(){
    const now=new Date().toISOString();
    await Promise.all(unreadNotifications.map(item=>supabase.from("notification_reads").insert({id:`${organization.id}_${profile.id}_${item.id}`,organization_id:organization.id,user_id:profile.id,notification_id:item.id,read_at:now})));
    setNotificationReads(current=>[...current,...unreadNotifications.map(item=>({id:`${organization.id}_${profile.id}_${item.id}`,organization_id:organization.id,user_id:profile.id,notification_id:item.id,read_at:now}))]);
  }
  return <main className="app-shell" style={{"--navy":organization.primary_color,"--sun":organization.accent_color} as React.CSSProperties}>
    <header className="topbar">
      <div className="topbar-brand"><button className="menu-trigger" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>☰</button><Logo compact /><span className="topbar-live"><i/> CENTRO OPERATIVO</span></div>
      <div className="topbar-actions"><button className="bell-button" aria-label={`Notificaciones sin leer: ${unreadNotifications.length}`} aria-expanded={bellOpen} onClick={()=>setBellOpen(!bellOpen)}>🔔{unreadNotifications.length>0&&<b>{unreadNotifications.length}</b>}</button><button className="profile" onClick={() => void supabase.auth.signOut()} title="Cerrar sesión"><span>{initials}</span><b>{profile.full_name}</b><em>{roleLabels[orgRole]}</em><small>Salir</small></button></div>
    </header>
    {bellOpen&&<aside className="notification-panel"><div><span><strong>Notificaciones</strong><small>{unreadNotifications.length} sin leer</small></span><button onClick={()=>setBellOpen(false)}>×</button></div>{unreadNotifications.length>0&&<button className="notification-read-all" onClick={()=>void markAllNotificationsRead()}>✓ Marcar todas como leídas</button>}{notifications.length===0?<Empty title="Todo al día" text="No hay avisos urgentes ni vencimientos cercanos."/>:notifications.map(item=><button className={readIds.has(item.id)?"is-read":""} key={item.id} onClick={()=>{void markNotificationRead(item.id);go(item.module);setBellOpen(false)}}><i/><span><b>{item.title}</b><small>{item.text}</small></span></button>)}</aside>}
    <div className="page module-stage" key={active}>
      {active === "inicio" && <HomeDashboard organization={organization} organizations={organizations} canAdmin={canAdmin} selectOrganization={setOrganizationId} teams={teams} members={members} headquarters={headquarters} entries={entries} claims={claims} projects={projects} activities={activities} referents={referents} voters={voters} go={go} />}
      {active === "votantes" && <VotersView user={session.user} organization={organization} items={voterImports} voters={voters} reload={loadContext}/>}
      {active === "sedes" && <LocationsView organization={organization} teams={teams} members={members} items={headquarters} reload={loadContext} />}
      {active === "presupuesto" && <Budget user={session.user} organization={organization} entries={entries} reload={loadContext} />}
      {active === "gestion" && <ManagementView user={session.user} organization={organization} teams={teams} members={members} headquarters={headquarters} claims={claims} projects={projects} reload={loadContext} />}
      {active === "agenda" && <AgendaView user={session.user} organization={organization} teams={teams} members={members} headquarters={headquarters} items={activities} reload={loadContext}/>}
      {(Object.keys(campaignModuleConfig) as (keyof typeof campaignModuleConfig)[]).map(moduleId=>active===moduleId&&<CampaignModuleView key={moduleId} moduleId={moduleId} user={session.user} organization={organization} members={members} locations={headquarters} items={campaignRecords[moduleId]} voters={voters} reload={loadContext}/>) }
      {active === "admin" && <AdminView profile={profile} organization={organization} organizations={organizations} teams={teams} members={members} referents={referents} auditItems={auditItems} reloadAll={reloadAll} selectOrganization={setOrganizationId} />}
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
    const timer = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        let profileResult = await supabase.from("profiles").select("id,full_name,role,active,is_platform_admin").eq("id", session.user.id).maybeSingle();
        let currentProfile = profileResult.data as Profile | null;
        const membershipCheck=await supabase.from("memberships").select("organization_id").eq("user_id",session.user.id).limit(1);
        if (!currentProfile || (!currentProfile.is_platform_admin && !(membershipCheck.data??[]).length)) {
          await supabase.access.activateAuthorizedAccess();
          profileResult = await supabase.from("profiles").select("id,full_name,role,active,is_platform_admin").eq("id", session.user.id).maybeSingle();
          currentProfile = profileResult.data as Profile | null;
        }
        const isBootstrapAdmin = session.user.email?.toLowerCase() === "emilianovillagra@gmail.com";
        if (!currentProfile && isBootstrapAdmin) {
          const bootstrapProfile: Profile = {
            id: session.user.id,
            full_name: "Emiliano Villagra",
            role: "admin",
            active: true,
            is_platform_admin: true,
          };
          const profileCreation = await supabase.from("profiles").insert(bootstrapProfile).select().single();
          if (!profileCreation.error) currentProfile = bootstrapProfile;
        }
        if (currentProfile?.is_platform_admin && isBootstrapAdmin) {
          const organizationId = "rumbo-al-9-de-mayo";
          await supabase.from("organizations").insert({
            id: organizationId,
            name: "Equipo Ernesto Nagle",
            candidate_name: "Ernesto Nagle",
            position_sought: "Legislador provincial",
            slug: "ernesto-nagle",
            primary_color: "#182554",
            accent_color: "#f4a640",
            active: true,
            plan_name: "Campaña completa",
            license_status: "active",
          });
          // El administrador de plataforma administra todos los espacios sin pertenecer a sus equipos.
          await supabase.from("memberships").delete()
            .eq("organization_id", organizationId)
            .eq("user_id", session.user.id);
        }
        setProfile(currentProfile);
        setLoading(false);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session]);
  const publicParams=typeof window!=="undefined"?new URLSearchParams(window.location.search):null;
  const publicToken=publicParams?.get("public")??"";
  const publicFormType=publicParams?.get("form")??"";
  if(publicToken&&["gestion","eventos","logistica","fiscalizacion"].includes(publicFormType))return <PublicForm token={publicToken} formType={publicFormType}/>;
  if (loading) return <Splash/>;
  if (!session) return <Login />;
  if (!profile || !profile.active) return <main className="access-state"><Logo /><h1>Acceso pendiente</h1><p>Esta cuenta no pertenece a un espacio político habilitado. Comunicate con el referente o administrador de tu campaña para solicitar acceso.</p><button className="primary compact" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></main>;
  return <Dashboard session={session} profile={profile} />;
}
