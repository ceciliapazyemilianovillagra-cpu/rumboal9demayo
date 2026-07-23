import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://oaitfjbfyroaktxchbex.supabase.co";
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_jC3W8Aq8fxIhm2cXBDzUaQ_Sh3-E9Lt";

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Falta configurar la conexión pública de Supabase.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
