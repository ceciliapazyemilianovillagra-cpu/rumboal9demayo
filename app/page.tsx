"use client";

import { useState } from "react";

const modules = [
  { id: "inicio", label: "Inicio", icon: "⌂" },
  { id: "votantes", label: "Votantes", icon: "◎" },
  { id: "sedes", label: "Sedes", icon: "◇" },
  { id: "presupuesto", label: "Presupuesto", icon: "$" },
  { id: "mas", label: "Más", icon: "•••" },
];

const cards = [
  { eyebrow: "BASE TERRITORIAL", value: "12.480", label: "votantes registrados", trend: "+342 esta semana", tone: "blue", icon: "◎" },
  { eyebrow: "ORGANIZACIÓN", value: "18", label: "sedes activas", trend: "4 reuniones hoy", tone: "green", icon: "◇" },
  { eyebrow: "RECURSOS", value: "$ 8,4 M", label: "presupuesto disponible", trend: "68% sin comprometer", tone: "amber", icon: "$" },
];

const tasks = [
  { title: "Reunión Barrio Norte", meta: "Hoy · 19:30 · Sede 04", status: "Confirmada", dot: "green" },
  { title: "Importar padrón Circuito 12", meta: "Vence mañana · Equipo de datos", status: "Pendiente", dot: "amber" },
  { title: "Revisar presupuesto de movilidad", meta: "Viernes · Administración", status: "En revisión", dot: "blue" },
];

function Login({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark">9</div>
        <p>RUMBO AL</p>
        <h1>9 DE MAYO</h1>
        <span>Organización, territorio y resultados.</span>
      </section>
      <section className="login-card">
        <div className="login-heading">
          <span className="kicker">ACCESO AL EQUIPO</span>
          <h2>Bienvenido</h2>
          <p>Ingresá con tu cuenta autorizada para continuar.</p>
        </div>
        <label>Correo electrónico<input type="email" placeholder="nombre@equipo.com" /></label>
        <label>Contraseña<input type="password" placeholder="••••••••" /></label>
        <div className="login-options"><label className="check"><input type="checkbox" /> Recordarme</label><button>¿Olvidaste tu contraseña?</button></div>
        <button className="primary" onClick={onEnter}>Ingresar a la plataforma <span>→</span></button>
        <p className="demo-note">Vista inicial de demostración. El acceso seguro se activará al conectar Supabase.</p>
      </section>
    </main>
  );
}

function Dashboard({ onExit }: { onExit: () => void }) {
  const [active, setActive] = useState("inicio");
  const [notice, setNotice] = useState("");

  const go = (id: string) => {
    setActive(id);
    if (id !== "inicio") setNotice(`${modules.find((m) => m.id === id)?.label}: módulo listo para la próxima etapa`);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="identity"><div className="mini-mark">9</div><div><strong>RUMBO AL 9 DE MAYO</strong><span>Centro de operaciones</span></div></div>
        <div className="top-actions"><button aria-label="Notificaciones" className="icon-button">◌<i /></button><button className="profile" onClick={onExit}><span>MN</span><b>María N.</b><em>Coordinación</em><small>⌄</small></button></div>
      </header>

      <div className="page">
        <section className="hero-row">
          <div><p className="kicker">MIÉRCOLES, 22 DE JULIO</p><h1>Buen día, María.</h1><span>Este es el pulso de la campaña.</span></div>
          <div className="countdown"><span>CUENTA REGRESIVA</span><strong>291</strong><b>DÍAS</b><small>HASTA EL 9 DE MAYO</small></div>
        </section>

        <section className="stats-grid">
          {cards.map((card) => <article className={`stat-card ${card.tone}`} key={card.eyebrow}><div className="card-icon">{card.icon}</div><p>{card.eyebrow}</p><strong>{card.value}</strong><span>{card.label}</span><small>↗ {card.trend}</small></article>)}
        </section>

        <section className="content-grid">
          <article className="panel territory">
            <div className="panel-head"><div><p className="kicker">AVANCE TERRITORIAL</p><h2>Cobertura por zona</h2></div><button onClick={() => setNotice("Mapa territorial: vista detallada próximamente")}>Ver detalle →</button></div>
            <div className="progress-row"><span>San Miguel de Tucumán</span><b>64%</b><div><i style={{ width: "64%" }} /></div><small>8.240 de 12.875</small></div>
            <div className="progress-row"><span>Yerba Buena</span><b>48%</b><div><i style={{ width: "48%" }} /></div><small>2.180 de 4.540</small></div>
            <div className="progress-row"><span>Tafí Viejo</span><b>31%</b><div><i style={{ width: "31%" }} /></div><small>1.340 de 4.320</small></div>
          </article>

          <article className="panel agenda">
            <div className="panel-head"><div><p className="kicker">PRÓXIMAS ACCIONES</p><h2>Agenda del equipo</h2></div><button className="add" onClick={() => setNotice("Nueva acción: formulario en preparación")}>+</button></div>
            <div className="task-list">{tasks.map((task) => <div className="task" key={task.title}><i className={task.dot} /><div><strong>{task.title}</strong><span>{task.meta}</span></div><em>{task.status}</em></div>)}</div>
          </article>
        </section>

        <section className="quick-section"><div><p className="kicker">ACCESOS RÁPIDOS</p><h2>¿Qué necesitás hacer?</h2></div><div className="quick-grid"><button onClick={() => go("votantes")}><span>＋</span><b>Agregar votante</b><small>Registrar contacto territorial</small></button><button onClick={() => go("presupuesto")}><span>$</span><b>Registrar gasto</b><small>Cargar comprobante o compromiso</small></button><button onClick={() => setNotice("Nueva reunión: formulario en preparación")}><span>◷</span><b>Crear reunión</b><small>Convocar equipo o referentes</small></button><button onClick={() => setNotice("Reclamos: módulo previsto en la hoja de ruta")}><span>!</span><b>Nuevo reclamo</b><small>Dar seguimiento a una gestión</small></button></div></section>
      </div>

      <nav className="bottom-nav" aria-label="Navegación principal">{modules.map((item) => <button className={active === item.id ? "active" : ""} onClick={() => go(item.id)} key={item.id}><span>{item.icon}</span>{item.label}</button>)}</nav>
      {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
    </main>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  return loggedIn ? <Dashboard onExit={() => setLoggedIn(false)} /> : <Login onEnter={() => setLoggedIn(true)} />;
}
