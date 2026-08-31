"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { firebase } from "../lib/firebase";

export function isNagleWorkspace(organization: {candidate_name:string} | undefined) {
  return organization?.candidate_name.trim().toLocaleLowerCase("es") === "ernesto nagle";
}

type Team = {id:string;name:string;description:string|null;parent_team_id?:string|null;leader_user_id?:string|null;area?:string;sector?:string;team_kind?:string};
type Member = {user_id:string;active:boolean;profiles:{full_name:string}|null};
type Day = {id:string;title:string;starts_ms:number;ends_ms:number;active:boolean};
type CheckIn = {id:string;user_id:string;status:string;created_at:string;latitude:number|null;longitude:number|null};
type Props = {organizationId:string;userId:string;canManage:boolean;teams:Team[];members:Member[];reload:()=>Promise<void>};

export function StaffWorkspace({organizationId,userId,canManage,teams,members,reload}:Props) {
  const [tab,setTab]=useState("equipos");
  const [days,setDays]=useState<Day[]>([]);
  const [checkIns,setCheckIns]=useState<CheckIn[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [consent,setConsent]=useState(false);
  const [dayId,setDayId]=useState("");
  const [now,setNow]=useState(Date.now());
  const loadDays=useCallback(async()=>{
    const result=await firebase.from("staff_days").select("*").eq("organization_id",organizationId).limit(100);
    if(result.error)setMessage("No se pudieron cargar las jornadas. Probá actualizar.");
    else setDays((result.data??[]) as Day[]);
  },[organizationId]);
  useEffect(()=>{void loadDays();const clock=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(clock);},[loadDays]);
  const available=days.filter(day=>day.active&&day.starts_ms<=now&&day.ends_ms>now);

  async function createTeam(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage("");
    const form=event.currentTarget,data=new FormData(form);
    const result=await firebase.from("teams").insert({organization_id:organizationId,name:String(data.get("name")).trim(),description:String(data.get("description")??""),parent_team_id:data.get("parent_team_id")||null,leader_user_id:data.get("leader_user_id")||null,area:String(data.get("area")??""),sector:String(data.get("sector")??""),team_kind:data.get("team_kind"),active:true});
    if(result.error)setMessage("No se pudo guardar el equipo.");else{form.reset();await reload();setMessage("Equipo creado. Los permisos de acceso se asignan por separado en Administración.");}setBusy(false);
  }
  async function createDay(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;const form=event.currentTarget,data=new FormData(form);
    const starts=new Date(String(data.get("starts"))).getTime(),ends=new Date(String(data.get("ends"))).getTime();
    if(!Number.isFinite(starts)||!Number.isFinite(ends)||ends<=starts||ends-starts>86400000)return setMessage("La jornada debe durar entre un minuto y 24 horas.");
    setBusy(true);
    const result=await firebase.from("staff_days").insert({organization_id:organizationId,title:String(data.get("title")).trim(),starts_ms:starts,ends_ms:ends,active:true});
    if(result.error)setMessage("No se pudo habilitar la jornada.");else{form.reset();await loadDays();setMessage("Jornada habilitada. La recepción de ubicaciones termina automáticamente al finalizar.");}setBusy(false);
  }
  async function closeDay(day:Day){
    const result=await firebase.from("staff_days").update({active:false}).eq("id",day.id).eq("organization_id",organizationId);
    if(result.error)setMessage("No se pudo cerrar la jornada.");else{await loadDays();setMessage("Jornada cerrada: no admite más reportes.");}
  }
  async function report(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    const selected=available.find(day=>day.id===dayId);if(!selected)return setMessage("Elegí una jornada habilitada.");
    setBusy(true);setMessage("");const data=new FormData(event.currentTarget);
    try{
      let latitude:number|null=null,longitude:number|null=null,accuracy_m:number|null=null;
      if(consent){
        if(!navigator.geolocation)throw new Error("Este dispositivo no permite compartir ubicación. Podés enviar sin ubicación.");
        const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}));
        latitude=position.coords.latitude;longitude=position.coords.longitude;accuracy_m=position.coords.accuracy;
      }
      const result=await firebase.from("staff_checkins").insert({organization_id:organizationId,day_id:selected.id,user_id:userId,status:data.get("status"),location_consent:consent,latitude,longitude,accuracy_m});
      if(result.error)throw result.error;
      setConsent(false);setMessage("Reporte enviado. No se realiza seguimiento en segundo plano.");
    }catch{setMessage("No se pudo enviar. Revisá si la jornada sigue abierta y el permiso de ubicación, o enviá sin ubicación.");}finally{setBusy(false);}
  }
  async function loadReports(){
    const result=await firebase.from("staff_checkins").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(100);
    if(result.error)setMessage("No se pudieron cargar los reportes.");else setCheckIns((result.data??[]) as CheckIn[]);
  }
  async function copyLink(){
    try{await navigator.clipboard.writeText(`${window.location.origin}/?workspace=${encodeURIComponent(organizationId)}&module=organizacion`);setMessage("Enlace copiado. Solo pueden ingresar integrantes autorizados con su correo.");}catch{setMessage("No se pudo copiar el enlace. Podés compartir la dirección de esta aplicación.");}
  }
  return <section className="staff-workspace">
    <div className="module-title"><div><p className="kicker">EQUIPO ERNESTO NAGLE</p><h1>Organización del equipo</h1><span>Responsables, equipos y jornadas del personal. Sin seguimiento de votantes.</span></div></div>
    <div className="admin-tabs"><button className={tab==="equipos"?"active":""} onClick={()=>setTab("equipos")}>Equipos y responsables</button><button className={tab==="jornadas"?"active":""} onClick={()=>setTab("jornadas")}>Jornadas y reportes</button></div>
    {tab==="equipos"&&<>
      {canManage&&<form className="panel entry-form" onSubmit={createTeam}><h2>Crear equipo</h2><div className="form-grid">
        <label>Nombre<input name="name" required maxLength={100}/></label>
        <label>Tipo<select name="team_kind"><option>Coordinación</option><option>Responsables barriales</option><option>Equipo de apoyo</option><option>Integrantes nuevos</option></select></label>
        <label>Depende de<select name="parent_team_id"><option value="">Coordinación general</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label>Responsable<select name="leader_user_id"><option value="">Por asignar</option>{members.filter(member=>member.active).map(member=><option key={member.user_id} value={member.user_id}>{member.profiles?.full_name??"Integrante"}</option>)}</select></label>
        <label>Barrio<input name="area" maxLength={100}/></label><label>Sector<input name="sector" maxLength={100}/></label>
        <label className="wide">Función del equipo<textarea name="description" maxLength={500}/></label>
      </div><button className="primary compact" disabled={busy}>Guardar equipo</button></form>}
      <div className="cards-list">{teams.map(team=><article className="panel" key={team.id}><p className="kicker">{team.team_kind??"EQUIPO"}</p><h2>{team.name}</h2><p>{team.description}</p><p>Depende de: {teams.find(parent=>parent.id===team.parent_team_id)?.name??"Coordinación general"}</p><p>Responsable: {members.find(member=>member.user_id===team.leader_user_id)?.profiles?.full_name??"Por asignar"}</p><small>{[team.area,team.sector].filter(Boolean).join(" · ")||"Sin zona asignada"}</small></article>)}</div>
      {!teams.length&&<p className="panel">Todavía no hay equipos. El administrador puede crear la estructura sin cargar personas ficticias.</p>}
    </>}
    {tab==="jornadas"&&<>
      {canManage&&<form className="panel entry-form" onSubmit={createDay}><h2>Habilitar jornada de trabajo o prueba</h2><div className="form-grid"><label>Nombre<input name="title" required maxLength={100}/></label><label>Desde<input type="datetime-local" name="starts" required/></label><label>Hasta<input type="datetime-local" name="ends" required/></label></div><button disabled={busy} className="primary compact">Habilitar jornada</button><button type="button" className="pdf-button" onClick={()=>void copyLink()}>Copiar enlace para el personal</button></form>}
      <form className="panel entry-form" onSubmit={report}><h2>Informar mi estado</h2><div className="form-grid"><label>Jornada<select required value={dayId} onChange={event=>setDayId(event.target.value)}><option value="">Elegí la jornada</option>{available.map(day=><option key={day.id} value={day.id}>{day.title}</option>)}</select></label><label>Estado<select name="status"><option>Disponible</option><option>Llegué al lugar de trabajo</option><option>Tarea terminada</option><option>Necesito asistencia</option></select></label></div>
        <label className="staff-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>Quiero compartir mi ubicación para este reporte. Solo la verá la coordinación. Puedo enviar sin ubicación.</label><p>No hay rastreo continuo. El permiso se solicita para cada envío y termina al cerrar la jornada. Los reportes ya enviados quedan como historial.</p><button className="primary compact" disabled={busy||available.length===0}>{busy?"Enviando…":"Enviar reporte"}</button>{!available.length&&<p>No hay jornadas abiertas.</p>}</form>
      {canManage&&<article className="panel"><h2>Jornadas registradas</h2>{days.map(day=><div className="staff-day" key={day.id}><span><b>{day.title}</b><small>{new Date(day.starts_ms).toLocaleString("es-AR")} — {new Date(day.ends_ms).toLocaleString("es-AR")}</small></span>{day.active&&day.ends_ms>now?<button className="pdf-button" onClick={()=>void closeDay(day)}>Cerrar jornada</button>:<span>Finalizada</span>}</div>)}<button className="pdf-button" onClick={()=>void loadReports()}>Consultar últimos 100 reportes</button>{checkIns.map(report=><div className="staff-day" key={report.id}><span><b>{members.find(member=>member.user_id===report.user_id)?.profiles?.full_name??"Integrante"}</b><small>{report.status} · {new Date(report.created_at).toLocaleString("es-AR")}</small></span>{report.latitude!==null&&report.longitude!==null?<span>{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}</span>:<span>Sin ubicación</span>}</div>)}</article>}
    </>}
    {message&&<p className="form-message" role="status">{message}</p>}
  </section>;
}
