-- Demo comercial completamente ficticia.
-- Conserva las cuentas de acceso existentes y reemplaza todos los datos operativos.
do $$
declare
  admin_id uuid;
  coordinator_id uuid;
  org_id uuid;
  team_general uuid;
  team_norte uuid;
  team_sur uuid;
  team_comunicacion uuid;
  sede_centro bigint;
  sede_norte bigint;
  sede_sur bigint;
  sede_alberdi bigint;
  sede_yerba bigint;
  reclamo_luces bigint;
  reclamo_agua bigint;
  reclamo_plaza bigint;
  proyecto_luces bigint;
  proyecto_agua bigint;
  proyecto_plaza bigint;
begin
  select id into admin_id
  from public.profiles
  where is_platform_admin and active
  order by created_at
  limit 1;

  if admin_id is null then
    raise exception 'No existe un administrador activo para la demo';
  end if;

  select id into coordinator_id
  from public.profiles
  where id <> admin_id and active
  order by created_at
  limit 1;

  if coordinator_id is null then
    coordinator_id := admin_id;
  end if;

  -- Se conserva el identificador técnico del espacio para no alterar accesos.
  select id into org_id
  from public.organizations
  order by created_at
  limit 1;

  -- Limpieza explícita en orden de dependencias. El historial se vacía al final.
  delete from public.entity_attachments;
  delete from public.voter_imports;
  delete from public.operational_targets;
  delete from public.proposals;
  delete from public.projects;
  delete from public.claims;
  delete from public.activities;
  delete from public.territorial_referents;
  delete from public.budget_entries;
  delete from public.voters;
  delete from public.headquarters;
  delete from public.memberships;
  delete from public.teams;
  delete from public.audit_log;

  update public.profiles
  set full_name = case
    when id = admin_id then 'Sofía Romero'
    when id = coordinator_id then 'Martín Figueroa'
    else 'Usuario Demo'
  end,
  role = case when id = admin_id then 'admin'::app_role else 'coordinacion'::app_role end,
  active = true
  where id in (admin_id, coordinator_id);

  if org_id is null then
    insert into public.organizations (
      name, candidate_name, position_sought, slug, primary_color, accent_color,
      active, plan_name, license_status, license_expires_at
    ) values (
      'Impulso Tucumán', 'Mariana Suárez', 'Legisladora Provincial',
      'impulso-tucuman-demo', '#172554', '#e07a3f',
      true, 'campaña', 'active', now() + interval '18 months'
    ) returning id into org_id;
  else
    update public.organizations
    set name = 'Impulso Tucumán',
        candidate_name = 'Mariana Suárez',
        position_sought = 'Legisladora Provincial',
        slug = 'impulso-tucuman-demo',
        primary_color = '#172554',
        accent_color = '#e07a3f',
        active = true,
        plan_name = 'campaña',
        license_status = 'active',
        license_expires_at = now() + interval '18 months',
        logo_url = null
    where id = org_id;
  end if;

  insert into public.teams (organization_id, name, description)
  values (org_id, 'Coordinación General', 'Conducción política, agenda y seguimiento integral')
  returning id into team_general;

  insert into public.teams (organization_id, name, description)
  values (org_id, 'Territorio Norte', 'Circuitos 1, 2, 3 y barrios del norte')
  returning id into team_norte;

  insert into public.teams (organization_id, name, description)
  values (org_id, 'Territorio Sur', 'Circuitos 7, 8, 9 y barrios del sur')
  returning id into team_sur;

  insert into public.teams (organization_id, name, description)
  values (org_id, 'Comunicación y Eventos', 'Prensa, contenidos, actos y logística')
  returning id into team_comunicacion;

  insert into public.memberships (
    organization_id, user_id, team_id, role, active, allowed_modules
  ) values (
    org_id, admin_id, team_general, 'admin', true,
    array['votantes','sedes','presupuesto','gestion','agenda','propuestas','territorio']
  );

  if coordinator_id <> admin_id then
    insert into public.memberships (
      organization_id, user_id, team_id, role, active, allowed_modules
    ) values (
      org_id, coordinator_id, team_norte, 'coordinacion', true,
      array['votantes','sedes','presupuesto','gestion','agenda','propuestas','territorio']
    );
  end if;

  insert into public.headquarters (
    organization_id, name, address, circuit, leader_name, phone, notes,
    team_id, responsible_user_id, latitude, longitude
  ) values (
    org_id, 'Casa Central', 'San Martín 620, San Miguel de Tucumán', 'Circuito 1',
    'Sofía Romero', '+54 381 555-0100', 'Reuniones de coordinación y atención general',
    team_general, admin_id, -26.83035, -65.20310
  ) returning id into sede_centro;

  insert into public.headquarters (
    organization_id, name, address, circuit, leader_name, phone, notes,
    team_id, responsible_user_id, latitude, longitude
  ) values (
    org_id, 'Sede Barrio Norte', 'Santa Fe 1480, San Miguel de Tucumán', 'Circuito 2',
    'Martín Figueroa', '+54 381 555-0101', 'Punto de encuentro del equipo norte',
    team_norte, coordinator_id, -26.81065, -65.21090
  ) returning id into sede_norte;

  insert into public.headquarters (
    organization_id, name, address, circuit, leader_name, phone, notes,
    team_id, responsible_user_id, latitude, longitude
  ) values (
    org_id, 'Sede Sur', 'Jujuy 2250, San Miguel de Tucumán', 'Circuito 8',
    'Carolina Méndez', '+54 381 555-0102', 'Operativo territorial y recepción de reclamos',
    team_sur, coordinator_id, -26.85290, -65.21610
  ) returning id into sede_sur;

  insert into public.headquarters (
    organization_id, name, address, circuit, leader_name, phone, notes,
    team_id, responsible_user_id, latitude, longitude
  ) values (
    org_id, 'Punto Alberdi', 'Av. Alem 780, Juan Bautista Alberdi', 'Circuito 15',
    'Diego Soria', '+54 381 555-0103', 'Base para recorridas del interior',
    team_sur, coordinator_id, -27.58660, -65.62030
  ) returning id into sede_alberdi;

  insert into public.headquarters (
    organization_id, name, address, circuit, leader_name, phone, notes,
    team_id, responsible_user_id, latitude, longitude
  ) values (
    org_id, 'Sede Yerba Buena', 'Aconquija 1720, Yerba Buena', 'Circuito 5',
    'Lucía Herrera', '+54 381 555-0104', 'Eventos, voluntariado y comunicación',
    team_comunicacion, admin_id, -26.81670, -65.28280
  ) returning id into sede_yerba;

  insert into public.budget_entries (
    organization_id, kind, category, description, amount, occurred_on,
    status, payment_method, notes, created_by
  ) values
    (org_id, 'ingreso', 'Aportes', 'Fondo inicial de campaña', 12000000, current_date - 32, 'confirmado', 'Transferencia', 'Aporte ficticio para demostración', admin_id),
    (org_id, 'ingreso', 'Aportes', 'Cena de recaudación', 2850000, current_date - 18, 'confirmado', 'Transferencia', 'Evento demostrativo', admin_id),
    (org_id, 'ingreso', 'Aportes', 'Contribuciones de adherentes', 1650000, current_date - 9, 'confirmado', 'Transferencia', null, admin_id),
    (org_id, 'gasto', 'Sedes', 'Alquiler y depósito Casa Central', 920000, current_date - 28, 'confirmado', 'Transferencia', null, admin_id),
    (org_id, 'gasto', 'Comunicación', 'Diseño e impresión de material gráfico', 1350000, current_date - 21, 'confirmado', 'Transferencia', null, admin_id),
    (org_id, 'gasto', 'Movilidad', 'Combustible y traslados territoriales', 485000, current_date - 15, 'confirmado', 'Tarjeta', null, admin_id),
    (org_id, 'gasto', 'Eventos', 'Sonido e iluminación acto de lanzamiento', 760000, current_date - 12, 'confirmado', 'Transferencia', null, admin_id),
    (org_id, 'gasto', 'Logística', 'Remeras, pecheras y credenciales', 540000, current_date - 7, 'confirmado', 'Transferencia', null, admin_id),
    (org_id, 'gasto', 'Comunicación', 'Campaña digital de alcance provincial', 390000, current_date - 4, 'confirmado', 'Tarjeta', null, admin_id),
    (org_id, 'compromiso', 'Eventos', 'Reserva de salón para encuentro de fiscales', 680000, current_date + 5, 'pendiente', 'Transferencia', null, admin_id),
    (org_id, 'compromiso', 'Logística', 'Impresión de propuestas y boletas simuladas', 1120000, current_date + 12, 'pendiente', 'Transferencia', null, admin_id),
    (org_id, 'compromiso', 'Movilidad', 'Contratación de minibuses para recorridas', 870000, current_date + 16, 'pendiente', 'Transferencia', null, admin_id);

  insert into public.claims (
    organization_id, title, description, neighbor_name, neighbor_phone,
    address, neighborhood, category, priority, status, headquarters_id,
    team_id, responsible_user_id, created_by, latitude, longitude
  ) values (
    org_id, 'Iluminación en plaza barrial',
    'Seis luminarias fuera de servicio y poca visibilidad en el acceso principal.',
    'Mónica Álvarez', '+54 381 555-0201', 'Plaza de Villa Luján', 'Villa Luján',
    'Alumbrado', 'alta', 'en_proceso', sede_norte, team_norte, coordinator_id,
    admin_id, -26.82150, -65.22290
  ) returning id into reclamo_luces;

  insert into public.claims (
    organization_id, title, description, neighbor_name, neighbor_phone,
    address, neighborhood, category, priority, status, headquarters_id,
    team_id, responsible_user_id, created_by, latitude, longitude
  ) values (
    org_id, 'Baja presión de agua',
    'El suministro pierde presión durante la tarde en cuatro cuadras del barrio.',
    'Raúl Campos', '+54 381 555-0202', 'Lavalle 3100', 'Barrio Sur',
    'Agua', 'urgente', 'asignado', sede_sur, team_sur, coordinator_id,
    admin_id, -26.85630, -65.21940
  ) returning id into reclamo_agua;

  insert into public.claims (
    organization_id, title, description, neighbor_name, neighbor_phone,
    address, neighborhood, category, priority, status, headquarters_id,
    team_id, responsible_user_id, created_by, latitude, longitude
  ) values (
    org_id, 'Recuperación de espacio verde',
    'La plaza necesita juegos, bancos y limpieza integral.',
    'Natalia Roldán', '+54 381 555-0203', 'Plaza Los Lapachos', 'Yerba Buena',
    'Limpieza', 'media', 'en_revision', sede_yerba, team_comunicacion, admin_id,
    admin_id, -26.81790, -65.27650
  ) returning id into reclamo_plaza;

  insert into public.claims (
    organization_id, title, description, neighbor_name, neighbor_phone,
    address, neighborhood, category, priority, status, headquarters_id,
    team_id, responsible_user_id, created_by, latitude, longitude
  ) values
    (org_id, 'Bache profundo frente a la escuela', 'Riesgo para motos y transporte escolar.', 'Pedro Díaz', '+54 381 555-0204', 'Mate de Luna 2450', 'Ciudadela', 'Calles', 'alta', 'nuevo', sede_centro, team_norte, coordinator_id, admin_id, -26.83370, -65.23800),
    (org_id, 'Refuerzo de seguridad en parada', 'Vecinos solicitan iluminación y presencia preventiva por la noche.', 'Elena Ruiz', '+54 381 555-0205', 'Av. Aconquija 2100', 'Yerba Buena', 'Seguridad', 'alta', 'asignado', sede_yerba, team_comunicacion, admin_id, admin_id, -26.81340, -65.29120),
    (org_id, 'Microbasural en esquina', 'Acumulación de residuos desde hace dos semanas.', 'Jorge Luna', '+54 381 555-0206', 'Jujuy y Olleros', 'Barrio Sur', 'Limpieza', 'media', 'resuelto', sede_sur, team_sur, coordinator_id, admin_id, -26.86170, -65.21570),
    (org_id, 'Turnos en CAPS', 'Demoras para acceder a controles pediátricos.', 'Silvia Acosta', '+54 381 555-0207', 'CAPS San Cayetano', 'San Cayetano', 'Salud', 'urgente', 'en_proceso', sede_sur, team_sur, coordinator_id, admin_id, -26.87010, -65.20340),
    (org_id, 'Semáforo intermitente', 'El semáforo funciona de manera irregular en hora pico.', 'Gabriel Paz', '+54 381 555-0208', 'Av. Belgrano y Ejército del Norte', 'Barrio Norte', 'Seguridad', 'alta', 'cerrado', sede_norte, team_norte, coordinator_id, admin_id, -26.81740, -65.22620);

  insert into public.projects (
    organization_id, name, objective, status, priority, responsible_user_id,
    team_id, source_claim_id, start_date, due_date, estimated_budget, created_by
  ) values (
    org_id, 'Corredores iluminados', 'Relevar y gestionar 40 puntos críticos de alumbrado.',
    'en_proceso', 'alta', coordinator_id, team_norte, reclamo_luces,
    current_date - 10, current_date + 28, 2400000, admin_id
  ) returning id into proyecto_luces;

  insert into public.projects (
    organization_id, name, objective, status, priority, responsible_user_id,
    team_id, source_claim_id, start_date, due_date, estimated_budget, created_by
  ) values (
    org_id, 'Mesa de gestión del agua', 'Consolidar casos y coordinar respuestas con prestadores.',
    'en_proceso', 'alta', coordinator_id, team_sur, reclamo_agua,
    current_date - 4, current_date + 18, 850000, admin_id
  ) returning id into proyecto_agua;

  insert into public.projects (
    organization_id, name, objective, status, priority, responsible_user_id,
    team_id, source_claim_id, start_date, due_date, estimated_budget, created_by
  ) values (
    org_id, 'Plazas vivas', 'Recuperar tres espacios verdes con participación vecinal.',
    'planificado', 'media', admin_id, team_comunicacion, reclamo_plaza,
    current_date + 3, current_date + 45, 3600000, admin_id
  ) returning id into proyecto_plaza;

  insert into public.projects (
    organization_id, name, objective, status, priority, responsible_user_id,
    team_id, start_date, due_date, estimated_budget, created_by
  ) values
    (org_id, 'Red de fiscales', 'Capacitar responsables para 120 mesas demostrativas.', 'en_proceso', 'alta', admin_id, team_general, current_date - 8, current_date + 35, 1800000, admin_id),
    (org_id, 'Escucha joven', 'Realizar encuentros con estudiantes y emprendedores.', 'completado', 'media', coordinator_id, team_comunicacion, current_date - 40, current_date - 2, 620000, admin_id);

  insert into public.proposals (
    organization_id, title, theme, diagnosis, solution, beneficiaries, status,
    responsible_user_id, source_claim_id, project_id, created_by
  ) values
    (org_id, 'Plan provincial de iluminación segura', 'Infraestructura', 'Persisten corredores con luminarias fuera de servicio y recorridos inseguros.', 'Mapa único de puntos críticos, recambio LED y seguimiento público de reparaciones.', 'Vecinos, estudiantes y trabajadores nocturnos', 'aprobada', coordinator_id, reclamo_luces, proyecto_luces, admin_id),
    (org_id, 'Respuesta rápida para agua y saneamiento', 'Salud', 'Los reclamos se dispersan y no permiten detectar zonas recurrentes.', 'Mesa digital de incidencias y protocolo de respuesta con plazos verificables.', 'Familias de barrios urbanos y comunas', 'en_revision', coordinator_id, reclamo_agua, proyecto_agua, admin_id),
    (org_id, 'Plazas activas y cuidadas', 'Ambiente', 'Los espacios verdes deteriorados pierden uso comunitario.', 'Presupuesto participativo para juegos, iluminación y mantenimiento.', 'Niños, familias y adultos mayores', 'publicada', admin_id, reclamo_plaza, proyecto_plaza, admin_id),
    (org_id, 'Primer empleo con formación digital', 'Empleo', 'Jóvenes sin experiencia encuentran barreras para su primera oportunidad laboral.', 'Convenios con pymes, capacitación corta y bolsa provincial de prácticas.', 'Jóvenes de 18 a 25 años', 'borrador', admin_id, null, null, admin_id);

  insert into public.activities (
    organization_id, title, activity_type, description, starts_at, ends_at,
    location, headquarters_id, team_id, responsible_user_id, status,
    reminder_minutes, created_by
  ) values
    (org_id, 'Reunión de coordinación semanal', 'reunion', 'Revisión de metas, agenda y responsables.', current_date + time '09:00', current_date + time '10:30', 'Casa Central', sede_centro, team_general, admin_id, 'confirmada', 60, admin_id),
    (org_id, 'Recorrida por Villa Luján', 'recorrida', 'Visita a comercios y puntos de iluminación.', current_date + interval '1 day' + time '17:30', current_date + interval '1 day' + time '20:00', 'Villa Luján', sede_norte, team_norte, coordinator_id, 'confirmada', 120, admin_id),
    (org_id, 'Encuentro con centros vecinales', 'reunion', 'Mesa de escucha sobre servicios públicos.', current_date + interval '2 days' + time '19:00', current_date + interval '2 days' + time '21:00', 'Sede Sur', sede_sur, team_sur, coordinator_id, 'programada', 120, admin_id),
    (org_id, 'Capacitación de fiscales', 'capacitacion', 'Primera jornada de procedimientos y organización.', current_date + interval '4 days' + time '18:00', current_date + interval '4 days' + time '21:00', 'Casa Central', sede_centro, team_general, admin_id, 'confirmada', 1440, admin_id),
    (org_id, 'Mateada con jóvenes emprendedores', 'evento', 'Presentación de la propuesta de primer empleo.', current_date + interval '6 days' + time '16:30', current_date + interval '6 days' + time '19:00', 'Sede Yerba Buena', sede_yerba, team_comunicacion, admin_id, 'programada', 180, admin_id),
    (org_id, 'Operativo de reclamos barriales', 'tarea', 'Carga y clasificación de necesidades del circuito 8.', current_date + interval '8 days' + time '09:30', current_date + interval '8 days' + time '13:00', 'Sede Sur', sede_sur, team_sur, coordinator_id, 'programada', 120, admin_id),
    (org_id, 'Reunión con comerciantes', 'reunion', 'Agenda de seguridad, limpieza y actividad económica.', current_date + interval '11 days' + time '20:00', current_date + interval '11 days' + time '21:30', 'Casa Central', sede_centro, team_general, admin_id, 'programada', 180, admin_id),
    (org_id, 'Caminata en Juan Bautista Alberdi', 'recorrida', 'Recorrido con referentes del interior.', current_date + interval '14 days' + time '10:00', current_date + interval '14 days' + time '13:00', 'Punto Alberdi', sede_alberdi, team_sur, coordinator_id, 'programada', 1440, admin_id),
    (org_id, 'Producción de contenidos semanales', 'tarea', 'Grabación de testimonios y piezas para redes.', current_date - interval '2 days' + time '14:00', current_date - interval '2 days' + time '18:00', 'Sede Yerba Buena', sede_yerba, team_comunicacion, admin_id, 'realizada', 60, admin_id),
    (org_id, 'Presentación de equipos territoriales', 'evento', 'Encuentro interno de responsables de zona.', current_date - interval '7 days' + time '19:00', current_date - interval '7 days' + time '21:00', 'Casa Central', sede_centro, team_general, admin_id, 'realizada', 120, admin_id);

  insert into public.territorial_referents (
    organization_id, full_name, phone, email, referent_type, neighborhood,
    circuit, zone, headquarters_id, team_id, reports_to_user_id,
    influence_level, status, notes, created_by, latitude, longitude
  ) values
    (org_id, 'Carolina Méndez', '+54 381 555-0301', 'carolina.mendez@example.com', 'dirigente', 'Barrio Sur', 'Circuito 8', 'Sur', sede_sur, team_sur, coordinator_id, 'alto', 'activo', 'Coordina tres barrios y operativos semanales.', admin_id, -26.85360, -65.21680),
    (org_id, 'Diego Soria', '+54 381 555-0302', 'diego.soria@example.com', 'dirigente', 'Juan Bautista Alberdi', 'Circuito 15', 'Interior Sur', sede_alberdi, team_sur, coordinator_id, 'alto', 'activo', 'Referente del interior y logística de recorridas.', admin_id, -27.58570, -65.61900),
    (org_id, 'Lucía Herrera', '+54 381 555-0303', 'lucia.herrera@example.com', 'coordinador', 'Yerba Buena', 'Circuito 5', 'Oeste', sede_yerba, team_comunicacion, admin_id, 'alto', 'activo', 'Coordina eventos y voluntariado joven.', admin_id, -26.81750, -65.28200),
    (org_id, 'Alejandro Paz', '+54 381 555-0304', 'alejandro.paz@example.com', 'referente', 'Villa Luján', 'Circuito 2', 'Norte', sede_norte, team_norte, coordinator_id, 'medio', 'activo', 'Seguimiento de iluminación y comercios.', admin_id, -26.82210, -65.22370),
    (org_id, 'Camila Rojas', '+54 381 555-0305', 'camila.rojas@example.com', 'colaborador', 'Barrio Norte', 'Circuito 2', 'Norte', sede_norte, team_norte, coordinator_id, 'medio', 'activo', 'Voluntariado y relevamiento puerta a puerta.', admin_id, -26.81250, -65.21690),
    (org_id, 'Federico Molina', '+54 381 555-0306', 'federico.molina@example.com', 'referente', 'Ciudadela', 'Circuito 3', 'Oeste', sede_centro, team_norte, coordinator_id, 'medio', 'activo', 'Articulación con clubes deportivos.', admin_id, -26.83520, -65.24000),
    (org_id, 'Valeria Acuña', '+54 381 555-0307', 'valeria.acuna@example.com', 'referente', 'San Cayetano', 'Circuito 9', 'Sur', sede_sur, team_sur, coordinator_id, 'alto', 'activo', 'Red de salud y comedores comunitarios.', admin_id, -26.87070, -65.20410),
    (org_id, 'Nicolás Peralta', '+54 381 555-0308', 'nicolas.peralta@example.com', 'colaborador', 'Villa Alem', 'Circuito 7', 'Sur', sede_sur, team_sur, coordinator_id, 'bajo', 'activo', 'Apoyo logístico y registro fotográfico.', admin_id, -26.84810, -65.21220),
    (org_id, 'Agustina Leiva', '+54 381 555-0309', 'agustina.leiva@example.com', 'coordinador', 'Centro', 'Circuito 1', 'Centro', sede_centro, team_general, admin_id, 'medio', 'activo', 'Agenda institucional y recepción.', admin_id, -26.83120, -65.20400),
    (org_id, 'Ramiro Juárez', '+54 381 555-0310', 'ramiro.juarez@example.com', 'referente', 'El Corte', 'Circuito 5', 'Oeste', sede_yerba, team_comunicacion, admin_id, 'medio', 'activo', 'Vínculo con centros vecinales.', admin_id, -26.79790, -65.29100),
    (org_id, 'Paula Benítez', '+54 381 555-0311', 'paula.benitez@example.com', 'colaborador', 'Lomas de Tafí', 'Circuito 4', 'Norte', sede_norte, team_norte, coordinator_id, 'medio', 'pausado', 'Disponibilidad parcial durante julio.', admin_id, -26.75040, -65.23500),
    (org_id, 'Matías Córdoba', '+54 381 555-0312', 'matias.cordoba@example.com', 'referente', 'Manantial Sur', 'Circuito 10', 'Sur', sede_sur, team_sur, coordinator_id, 'medio', 'activo', 'Organización de reuniones barriales.', admin_id, -26.89420, -65.23130);

  insert into public.voters (
    organization_id, dni, full_name, address, circuit, polling_place,
    contact_status, assigned_to, source_data
  ) values
    (org_id, 'D-00001', 'Adriana López', 'Santa Fe 1250', 'Circuito 2', 'Escuela Belgrano', 'contactado', coordinator_id, '{"mesa":"101","seccion":"Capital","telefono":"+54 381 555-0401"}'),
    (org_id, 'D-00002', 'Bruno Salvatierra', 'Maipú 980', 'Circuito 1', 'Colegio Nacional', 'apoya', admin_id, '{"mesa":"102","seccion":"Capital","telefono":"+54 381 555-0402"}'),
    (org_id, 'D-00003', 'Claudia Fernández', 'Lavalle 3150', 'Circuito 8', 'Escuela Mate de Luna', 'indeciso', coordinator_id, '{"mesa":"210","seccion":"Capital","telefono":"+54 381 555-0403"}'),
    (org_id, 'D-00004', 'Daniel Ibáñez', 'Jujuy 2190', 'Circuito 8', 'Escuela Mate de Luna', 'sin_contactar', coordinator_id, '{"mesa":"211","seccion":"Capital"}'),
    (org_id, 'D-00005', 'Elisa Navarro', 'Aconquija 1820', 'Circuito 5', 'Escuela Municipal', 'apoya', admin_id, '{"mesa":"305","seccion":"Yerba Buena","telefono":"+54 381 555-0405"}'),
    (org_id, 'D-00006', 'Facundo Gómez', 'San Martín 420', 'Circuito 1', 'Colegio Nacional', 'contactado', admin_id, '{"mesa":"103","seccion":"Capital"}'),
    (org_id, 'D-00007', 'Gabriela Quiroga', 'Ejército del Norte 840', 'Circuito 3', 'Escuela Sarmiento', 'sin_contactar', coordinator_id, '{"mesa":"155","seccion":"Capital"}'),
    (org_id, 'D-00008', 'Hernán Toledo', 'Av. Alem 750', 'Circuito 7', 'Escuela Avellaneda', 'apoya', coordinator_id, '{"mesa":"198","seccion":"Capital","telefono":"+54 381 555-0408"}'),
    (org_id, 'D-00009', 'Inés Castillo', 'Rivadavia 1410', 'Circuito 2', 'Escuela Belgrano', 'indeciso', coordinator_id, '{"mesa":"108","seccion":"Capital","telefono":"+54 381 555-0409"}'),
    (org_id, 'D-00010', 'Javier Bustos', 'Congreso 2600', 'Circuito 9', 'Escuela San Cayetano', 'contactado', coordinator_id, '{"mesa":"240","seccion":"Capital"}'),
    (org_id, 'D-00011', 'Karina Alderete', 'Colón 1350', 'Circuito 3', 'Escuela Sarmiento', 'apoya', admin_id, '{"mesa":"158","seccion":"Capital","telefono":"+54 381 555-0411"}'),
    (org_id, 'D-00012', 'Leonardo Cruz', 'Aconquija 2290', 'Circuito 5', 'Escuela Municipal', 'sin_contactar', admin_id, '{"mesa":"308","seccion":"Yerba Buena"}'),
    (org_id, 'D-00013', 'Mariela Romano', 'Perú 910', 'Circuito 2', 'Escuela Belgrano', 'contactado', coordinator_id, '{"mesa":"109","seccion":"Capital","telefono":"+54 381 555-0413"}'),
    (org_id, 'D-00014', 'Nahuel Villalba', 'La Plata 1880', 'Circuito 8', 'Escuela Mate de Luna', 'apoya', coordinator_id, '{"mesa":"215","seccion":"Capital"}'),
    (org_id, 'D-00015', 'Olga Carrizo', 'Mendoza 520', 'Circuito 1', 'Colegio Nacional', 'indeciso', admin_id, '{"mesa":"105","seccion":"Capital","telefono":"+54 381 555-0415"}'),
    (org_id, 'D-00016', 'Pablo Coronel', 'Av. Roca 2300', 'Circuito 9', 'Escuela San Cayetano', 'sin_contactar', coordinator_id, '{"mesa":"244","seccion":"Capital"}'),
    (org_id, 'D-00017', 'Romina Vargas', 'Lamadrid 1750', 'Circuito 7', 'Escuela Avellaneda', 'contactado', coordinator_id, '{"mesa":"202","seccion":"Capital","telefono":"+54 381 555-0417"}'),
    (org_id, 'D-00018', 'Sergio Medina', 'Cariola 650', 'Circuito 5', 'Escuela Municipal', 'apoya', admin_id, '{"mesa":"312","seccion":"Yerba Buena"}'),
    (org_id, 'D-00019', 'Tamara Sueldo', 'Italia 2340', 'Circuito 3', 'Escuela Sarmiento', 'sin_contactar', coordinator_id, '{"mesa":"162","seccion":"Capital"}'),
    (org_id, 'D-00020', 'Ulises Arias', 'San Juan 1680', 'Circuito 2', 'Escuela Belgrano', 'contactado', coordinator_id, '{"mesa":"112","seccion":"Capital","telefono":"+54 381 555-0420"}'),
    (org_id, 'D-00021', 'Verónica Márquez', 'Buenos Aires 3010', 'Circuito 8', 'Escuela Mate de Luna', 'apoya', coordinator_id, '{"mesa":"218","seccion":"Capital"}'),
    (org_id, 'D-00022', 'Walter Rodríguez', 'Crisóstomo Álvarez 740', 'Circuito 1', 'Colegio Nacional', 'indeciso', admin_id, '{"mesa":"107","seccion":"Capital","telefono":"+54 381 555-0422"}'),
    (org_id, 'D-00023', 'Ximena Molina', 'Las Rosas 330', 'Circuito 15', 'Escuela Alberdi', 'contactado', coordinator_id, '{"mesa":"410","seccion":"Alberdi","telefono":"+54 381 555-0423"}'),
    (org_id, 'D-00024', 'Yamila Ferreyra', 'Lules 1250', 'Circuito 10', 'Escuela Manantial', 'sin_contactar', coordinator_id, '{"mesa":"275","seccion":"Capital"}');

  insert into public.voter_imports (
    organization_id, file_name, file_size, source_format, status,
    detected_columns, column_mapping, total_rows, processed_rows, error_rows,
    notes, created_by
  ) values (
    org_id, 'padron_demo_tucuman.csv', 18432, 'csv', 'completado',
    '["dni","apellido_y_nombre","domicilio","circuito","establecimiento","mesa","seccion"]'::jsonb,
    '{"dni":"dni","full_name":"apellido_y_nombre","address":"domicilio","circuit":"circuito","polling_place":"establecimiento"}'::jsonb,
    24, 24, 0, 'Archivo ficticio preparado exclusivamente para la demostración comercial.', admin_id
  );

  insert into public.operational_targets (
    organization_id, metric, period_start, period_end, target_value, created_by
  ) values
    (org_id, 'reclamos_resueltos', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 30, admin_id),
    (org_id, 'actividades', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 24, admin_id),
    (org_id, 'barrios_cubiertos', current_date, current_date + 60, 35, admin_id),
    (org_id, 'referentes_activos', current_date, current_date + 60, 80, admin_id),
    (org_id, 'proyectos_completados', current_date, current_date + 90, 12, admin_id);
end
$$;
