/**
 * TanStack Start middleware registration.
 *
 * `server.ts` receives the outer HTTP request; this file configures what
 * TanStack does while processing normal requests and browser-invoked server
 * functions. It does not open a port and it does not query the database.
 */
import { createCsrfMiddleware, createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./Shared/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Convert unexpected application exceptions into a stable HTML 500 response.
// Framework HTTP errors keep their original status and continue upward.
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Server functions use the service-role database client, so reject cross-site
// requests before any privileged handler is allowed to run.
const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

/**
 * Global pipeline:
 * - functionMiddleware runs for createServerFn RPCs and attaches a browser
 *   Supabase access token when a session exists.
 * - requestMiddleware wraps all requests with error handling and blocks
 *   cross-site server-function requests.
 *
 * `attachSupabaseAuth` forwards a token; it does not validate the user or grant
 * manager authorization. Privileged handlers still need a server-side auth
 * guard before public deployment.
 */
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
