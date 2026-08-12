/**
 * Creation and lifetime management for the privileged Supabase server client.
 * This module knows credentials and transport details only; feature queries and
 * normalized relation mapping belong in sibling data-access modules.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types.server";

function isOpaqueApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createApiKeyFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // Opaque sb_secret keys authenticate through apikey, not a JWT bearer token.
    if (isOpaqueApiKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    const missing = [!url && "SUPABASE_URL", !secretKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
    throw new Error(`Missing server Supabase environment variable(s): ${missing.join(", ")}`);
  }

  return createClient<Database>(url, secretKey, {
    global: { fetch: createApiKeyFetch(secretKey) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let adminClient: ReturnType<typeof createAdminClient> | undefined;

/**
 * Privileged server-only database client. It bypasses RLS and must never be
 * imported into a browser component.
 */
export function getAdminDatabase() {
  adminClient ??= createAdminClient();
  return adminClient;
}
