import webpush from "https://esm.sh/web-push@3.6.7";

Deno.serve(async (req) => {
  try {
    webpush.setVapidDetails(
      "mailto:test@ipda.org.br",
      "BGdzvSnIMmH2PJUwTuDI9msG6Gfo2pR8EwVRj_echdF3xXXqEC4DABymgV8odBskaEr6-EgylrJFWZTx2x5WWro",
      "T6xK0h-tEaZ0O0XoE0jOhsQwXqIq8jO1FwPQsT8u1A8"
    );
    return new Response(JSON.stringify({ ok: true, typeofSend: typeof webpush.sendNotification }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
