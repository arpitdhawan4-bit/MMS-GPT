/**
 * src/lib/supabaseClient.ts
 * -------------------------
 * Singleton Supabase JS client for the frontend.
 * Credentials come from frontend/.env (VITE_ prefix = safe to expose in browser).
 *
 * BUCKET is the exact name you created in Supabase Dashboard → Storage → Buckets.
 * If uploads/downloads fail with "Object not found", double-check the bucket name here
 * matches the Supabase dashboard exactly (case-sensitive, spaces included).
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Supabase Storage bucket name — configured via VITE_SUPABASE_BUCKET in .env */
export const BUCKET =
  (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) ??
  "MMS GPT files";
