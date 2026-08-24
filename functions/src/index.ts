import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const VALID_ROLES = ["admin", "coordinacion", "territorio", "finanzas", "consulta"];
const VALID_MODULES = ["votantes", "sedes", "presupuesto", "gestion", "agenda", "propuestas", "territorio", "tareas", "operativos", "eventos", "comunicacion", "logistica", "fiscalizacion"];

async function canManage(uid: string, organizationId: string) {
  const [profile, membership] = await Promise.all([
    db.doc(`profiles/${uid}`).get(),
    db.doc(`memberships/${organizationId}_${uid}`).get(),
  ]);
  return profile.data()?.is_platform_admin === true ||
    (membership.data()?.active === true && ["admin", "coordinacion"].includes(membership.data()?.role));
}

export const invite_team_member = onCall({ region: "southamerica-east1" }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debe iniciar sesión.");
  const organizationId = String(request.data.organization_id ?? "");
  if (!organizationId || !(await canManage(request.auth.uid, organizationId))) {
    throw new HttpsError("permission-denied", "No tiene permiso para administrar este equipo.");
  }

  if (request.data.action === "remove") {
    const userId = String(request.data.user_id ?? "");
    if (!userId || userId === request.auth.uid) throw new HttpsError("invalid-argument", "Usuario inválido.");
    await db.doc(`memberships/${organizationId}_${userId}`).delete();
    return { status: "success", message: "Usuario retirado del equipo." };
  }

  const email = String(request.data.email ?? "").trim().toLowerCase();
  const fullName = String(request.data.full_name ?? "").trim().slice(0, 120);
  const role = String(request.data.role ?? "consulta");
  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || email.length > 254 || !VALID_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "Nombre, correo o rol inválidos.");
  }

  let user;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch {
    user = await getAuth().createUser({ email, displayName: fullName, disabled: false });
  }

  const allowedModules = Array.isArray(request.data.allowed_modules) ?
    request.data.allowed_modules.map(String).filter((moduleId: string) => VALID_MODULES.includes(moduleId)) : [];
  const teamId = request.data.team_id ? String(request.data.team_id).slice(0, 160) : null;
  const active = request.data.active !== false;
  const batch = db.batch();
  batch.set(db.doc(`profiles/${user.uid}`), {
    full_name: fullName,
    email,
    role,
    active: true,
    is_platform_admin: false,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(db.doc(`memberships/${organizationId}_${user.uid}`), {
    organization_id: organizationId,
    user_id: user.uid,
    team_id: teamId,
    role,
    active,
    allowed_modules: allowedModules,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { status: "success", message: "Usuario creado. Firebase enviará el enlace para definir su contraseña." };
});
