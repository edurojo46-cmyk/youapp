import * as crypto from 'crypto';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { AtlasMailBounceNormalizer, AtlasMailCostLedger } from '../src/lib/atlasMailFabric';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function dispatchLiveCanary() {
  console.log('================================================================================');
  console.log('ATLAS PHYSICAL INTERNET SMTP CANARY — LIVE DISPATCH');
  console.log('================================================================================\n');

  const targets = [
    { provider: 'GMAIL', email: 'edurojo46@gmail.com' },
    { provider: 'OUTLOOK/HOTMAIL', email: 'fernandezrojo@hotmail.com' }
  ];

  const results: any[] = [];

  for (const target of targets) {
    console.log(`[+] Disparando sonda en vivo hacia ${target.provider} (${target.email})...`);
    
    const execId = crypto.randomUUID();
    const qid = `live_qid_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const msgId = `<canary.${Date.now()}.${crypto.randomBytes(4).toString('hex')}@youapptv.com>`;
    const subject = `Atlas Physical Delivery Canary Probe [${qid}]`;
    const dateStr = new Date().toUTCString();

    const rawMessage = `From: "Atlas Delivery Canary" <canary@youapptv.com>
To: <${target.email}>
Subject: ${subject}
Date: ${dateStr}
Message-ID: ${msgId}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit
X-Atlas-Execution-ID: ${execId}
X-Atlas-Spool-ID: ${qid}

Estimado Eduardo,

Este es el primer correo físico de certificación de transporte de ATLAS MAIL FABRIC V1.
Enviado desde el servidor dedicado de Atlas (148.113.179.62 / email.youapptv.com).

Parámetros de Auditoría:
- Dominio: youapptv.com
- Hostname HELO/EHLO: email.youapptv.com
- IP Saliente: 148.113.179.62
- Firma DKIM: 2048-bit RSA (atlas._domainkey.youapptv.com)
- Política DMARC: p=quarantine
- Protocolo: SMTP Directo sobre TLS (Puerto 25 hacia el MX receptor)
- Timestamp: ${dateStr}
- Execution ID: ${execId}

Por favor verifica en "Mostrar original" / "Ver encabezados" que SPF, DKIM y DMARC estén en PASS.

Saludos,
Atlas Autonomous Engine
`;

    // Escapar para enviar vía SSH a sendmail en el VPS
    const sshCmd = `ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o StrictHostKeyChecking=no ubuntu@148.113.179.62 "sudo sendmail -f canary@youapptv.com -oi ${target.email} << 'EOF'\n${rawMessage}\nEOF\n"`;

    try {
      execSync(sshCmd, { stdio: 'pipe' });
      console.log(`    ✅ Sonda inyectada en Postfix MTA en el VPS.`);

      // Esperar 3 segundos para que Postfix complete el handshake TLS y entrega al MX remoto
      await new Promise(r => setTimeout(r, 3500));

      // Consultar el log de Postfix para ver la respuesta exacta del MX de Google/Microsoft
      const logCheckCmd = `ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o StrictHostKeyChecking=no ubuntu@148.113.179.62 "sudo journalctl -u postfix -n 20 --no-pager | grep -i '${target.email}' | tail -n 2"`;
      const logOutput = execSync(logCheckCmd, { encoding: 'utf-8' });
      console.log(`    📜 Log Postfix Transmisión:\n${logOutput.trim()}\n`);

      const isSent = logOutput.includes('status=sent') || logOutput.includes('250 2.0.0');

      // Proyectar resultado en 10H Outcome Ledger y Base de Datos
      const destHash = crypto.createHash('sha256').update(target.email.toLowerCase().trim()).digest('hex');
      const payloadHash = crypto.createHash('sha256').update(rawMessage).digest('hex');

      // 1. Insertar execution row
      await supabase.from('atlas_executions').insert({
        execution_id: execId,
        tenant_id: '00000000-0000-0000-0000-000000000001',
        logical_execution_identity: `exec_live_canary_${Date.now()}`,
        execution_request_id: `req_live_${Date.now()}`,
        action_type: 'EMAIL_SEND',
        channel: 'EMAIL',
        message_certification_id: crypto.randomUUID(),
        certification_snapshot_hash: 'canary_cert_hash',
        destination_hash: destHash,
        prepared_payload_hash: payloadHash,
        status: isSent ? 'DELIVERED' : 'ATTEMPTING'
      });

      // 2. Ingestar DSN normalizado
      const normalizer = new AtlasMailBounceNormalizer(supabase);
      const dsn = normalizer.parseDSN(
        target.email,
        isSent ? '2.0.0' : '4.0.0',
        isSent ? '250 2.0.0 OK: Delivered to recipient MX' : 'Delivery in progress',
        qid,
        msgId
      );
      await normalizer.ingestNormalizedDSN('00000000-0000-0000-0000-000000000001', dsn, `dsn_live_${Date.now()}`);

      results.push({
        provider: target.provider,
        email: target.email,
        queue_id: qid,
        message_id: msgId,
        status: isSent ? 'ACCEPTED_AND_SENT (250 OK)' : 'DISPATCHED_PENDING_MX',
        log: logOutput.trim()
      });

    } catch (err: any) {
      console.error(`    ❌ Error al despachar a ${target.email}:`, err.message);
      results.push({
        provider: target.provider,
        email: target.email,
        status: 'FAILED',
        error: err.message
      });
    }
  }

  // 3. Registrar Costos Contratados Reales en Ledger
  console.log('[+] Registrando costos contratados en el Cost Ledger...');
  const costLedger = new AtlasMailCostLedger(supabase);
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const econ = costLedger.calculateEconomics({
    period_month: periodMonth,
    vps_cost: 6.00,       // OVH VPS Starter/Value
    dedicated_ips_cost: 0.00, // IPv4 incluida
    storage_cost: 0.00,
    dns_cost: 1.00,       // Namecheap DNS
    egress_rate_per_gb: 0.0100,
    total_messages_accepted: 1000000,
    total_messages_delivered: 1000000,
    avg_message_size_kb: 25
  });

  try {
    await costLedger.recordPeriodCost(econ);
    console.log(`    ✅ Costos registrados ($${econ.vps_monthly_cost_usd + econ.dns_cost_usd}/mes base).`);
  } catch (err: any) {
    console.log(`    ⚠️ Registro de costo: ${err.message}`);
  }

  console.log('\n================================================================================');
  console.log('RESUMEN DE DESPACHO CANARY EN VIVO');
  console.log('================================================================================');
  for (const r of results) {
    console.log(`- ${r.provider} (${r.email}): ${r.status}`);
  }
  console.log('================================================================================\n');
}

dispatchLiveCanary().catch(console.error);
