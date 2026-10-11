export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === "demo-group.pages.dev") {
    url.hostname = "demogroup.rs";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }

  const response = await context.next();

  // The separate legacy DemoShop subtree is outside this change.
  if (url.pathname === "/demoshop" || url.pathname.startsWith("/demoshop/")) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (url.protocol === "https:" && url.hostname === "demogroup.rs" && !headers.has("Strict-Transport-Security")) {
    // One day, without includeSubDomains or preload: no change to other hosts.
    headers.set("Strict-Transport-Security", "max-age=86400");
  }

  if ((headers.get("Content-Type") || "").toLowerCase().includes("text/html")) {
    if (!headers.has("X-Frame-Options")) headers.set("X-Frame-Options", "SAMEORIGIN");
    // Narrow first policy: preserves existing scripts, fonts, maps and analytics.
    // A script-src allowlist needs a separate full resource/inline-script review.
    if (!headers.has("Content-Security-Policy")) {
      headers.set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
    }
    // Observe form destinations first: third-party redirects vary between browsers.
    // No reporting endpoint: violations stay in the browser console, not a new log service.
    if (!headers.has("Content-Security-Policy-Report-Only")) {
      headers.set("Content-Security-Policy-Report-Only", "form-action 'self' https://formsubmit.co https://demogroup.rs");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
