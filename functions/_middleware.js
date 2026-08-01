export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === "demo-group.pages.dev") {
    url.hostname = "demogroup.rs";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
