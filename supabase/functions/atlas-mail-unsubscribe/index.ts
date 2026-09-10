import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, list-unsubscribe-post",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id") || "00000000-0000-0000-0000-000000000001";
    const emailHash = url.searchParams.get("h");
    const executionId = url.searchParams.get("exec_id") || "00000000-0000-0000-0000-000000000000";

    // RFC 8058: One-Click POST request
    if (req.method === "POST") {
      let bodyText = "";
      try {
        bodyText = await req.text();
      } catch {
        // empty body
      }

      // Check for List-Unsubscribe=One-Click in body or header
      const isOneClick = bodyText.includes("List-Unsubscribe=One-Click") ||
                         req.headers.get("list-unsubscribe-post") === "List-Unsubscribe=One-Click" ||
                         url.searchParams.get("oneclick") === "1";

      if (!emailHash) {
        return new Response(JSON.stringify({ error: "Missing recipient hash" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Ingest suppression into atlas_outreach_suppressions (MARKETING scope)
      const { error } = await supabase.from("atlas_outreach_suppressions").upsert({
        tenant_id: tenantId,
        email_hash: emailHash,
        scope: "MARKETING",
        reason: "UNSUBSCRIBED",
        source_execution_id: executionId === "00000000-0000-0000-0000-000000000000" ? null : executionId
      }, { onConflict: "tenant_id,email_hash,scope" });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ status: "UNSUBSCRIBED", one_click: isOneClick }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // GET request (Human clicking unsubscribe link in browser)
    if (req.method === "GET") {
      const html = `<!DOCTYPE html>
<html>
<head><title>Unsubscribed</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 40px;">
  <h2>Has sido desuscrito exitosamente</h2>
  <p>No recibirás más correos de esta lista.</p>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
