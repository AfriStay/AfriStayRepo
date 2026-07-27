import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const { name, email, message } = await req.json();
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  // REPLACE with your actual email
  const ADMIN_EMAIL = "shema.josue.dev@gmail.com";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: "Contact Form <onboarding@resend.dev>",
      to: [ADMIN_EMAIL],
      subject: "New Contact Message",
      html: `<p>From: ${name} (${email})</p><p>${message}</p>`
    })
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
