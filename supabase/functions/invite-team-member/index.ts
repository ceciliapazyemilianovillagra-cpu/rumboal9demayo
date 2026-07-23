import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = new Set(["admin", "coordinacion", "territorio", "finanzas", "consulta"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesión inválida." }, 401);

    const token = authorization.slice("Bearer ".length);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerData, error: callerError } = await authClient.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Sesión inválida." }, 401);

    const body = await request.json();
    const action = String(body.action ?? "invite");
    const organizationId = String(body.organization_id ?? "");
    const { data: callerProfile } = await admin.from("profiles").select("is_platform_admin,active").eq("id", callerData.user.id).single();
    const { data: callerMembership } = await admin.from("memberships").select("role,active").eq("organization_id", organizationId).eq("user_id", callerData.user.id).maybeSingle();
    const authorized = callerProfile?.active && (callerProfile.is_platform_admin || (callerMembership?.active && callerMembership.role === "admin"));
    if (!authorized) return json({ error: "No tenes permisos para administrar usuarios." }, 403);
    if (action === "remove") {
      const userId = String(body.user_id ?? "");
      if (!userId || userId === callerData.user.id) return json({ error: "No podes borrar tu propio acceso." }, 400);
      const { error } = await admin.from("memberships").delete().eq("organization_id", organizationId).eq("user_id", userId);
      if (error) return json({ error: "No se pudo borrar el usuario." }, 500);
      const { count } = await admin.from("memberships").select("*", { count: "exact", head: true }).eq("user_id", userId);
      if (!count) await admin.auth.admin.deleteUser(userId);
      return json({ ok: true, status: "removed" });
    }
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const teamId = body.team_id ? String(body.team_id) : null;
    const role = String(body.role ?? "consulta");
    if (!email.includes("@") || fullName.length < 2 || !organizationId || !allowedRoles.has(role)) {
      return json({ error: "Revisá el nombre, correo y rol." }, 400);
    }

    if (teamId) {
      const { data: validTeam } = await admin.from("teams").select("id")
        .eq("id", teamId).eq("organization_id", organizationId).eq("active", true).maybeSingle();
      if (!validTeam) return json({ error: "El equipo seleccionado no pertenece a este espacio." }, 400);
    }

    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return json({ error: "No se pudo consultar los usuarios." }, 500);
    let user = listed.users.find((item) => item.email?.toLowerCase() === email);
    let invited = false;

    if (!user) {
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: "https://rumboal9demayo.vercel.app",
      });
      if (inviteError || !invitation.user) {
        return json({ error: inviteError?.message ?? "No se pudo enviar la invitación." }, 400);
      }
      user = invitation.user;
      invited = true;
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id, full_name: fullName, active: true,
    }, { onConflict: "id" });
    if (profileError) return json({ error: "No se pudo preparar el perfil." }, 500);

    const { error: membershipError } = await admin.from("memberships").upsert({
      organization_id: organizationId, user_id: user.id, team_id: teamId,
      role, active: true,
    }, { onConflict: "organization_id,user_id" });
    if (membershipError) return json({ error: "No se pudo asignar el usuario al equipo." }, 500);

    return json({
      ok: true, invited, user_id: user.id,
      status: invited ? "invited" : "existing",
    });
  } catch {
    return json({ error: "No se pudo procesar la invitación." }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
