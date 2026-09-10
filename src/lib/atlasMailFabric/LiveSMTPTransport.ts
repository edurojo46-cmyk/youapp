import * as net from 'net';
import * as tls from 'tls';
import { SMTPTransportOutcome } from './types';

export interface LiveSMTPConfig {
  host: string;
  port: number;
  secure?: boolean; // true for 465 (SSL), false for 587/25 (STARTTLS)
  user?: string;
  password?: string;
  heloHostname: string;
  connectionTimeoutMs?: number;
}

export interface LiveSMTPSendRequest {
  from: string;
  to: string;
  return_path: string;
  subject: string;
  body: string;
  message_id: string;
  mta_queue_id: string;
  custom_headers?: Record<string, string>;
}

export class LiveSMTPTransport {
  private config: LiveSMTPConfig;

  constructor(config: LiveSMTPConfig) {
    this.config = {
      connectionTimeoutMs: 15000,
      secure: false,
      ...config
    };
  }

  /**
   * Executes a real live SMTP conversation against a standard MTA (Postfix, Exim, etc.)
   * over TLS/STARTTLS with Zero-PII logging.
   */
  async send(request: LiveSMTPSendRequest): Promise<SMTPTransportOutcome> {
    const { from, to, return_path, subject, body, message_id, mta_queue_id, custom_headers } = request;

    // Security invariant: single recipient only
    if (to.includes(',') || to.includes(';')) {
      return {
        status: 'PERMANENT_FAILURE',
        smtp_response_code: 553,
        enhanced_status_code: '5.1.3',
        error_details: {
          code: 'MULTIPLE_RECIPIENTS_FORBIDDEN',
          message: 'Single recipient invariant violated for MTA dispatch',
          is_transient: false
        }
      };
    }

    // Security invariant: never expose raw tokens in outbound headers
    if (custom_headers) {
      for (const [key] of Object.entries(custom_headers)) {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
          return {
            status: 'REJECTED',
            smtp_response_code: 554,
            enhanced_status_code: '5.7.1',
            error_details: {
              code: 'SECURITY_VIOLATION',
              message: `Header '${key}' cannot contain raw tokens or secrets`,
              is_transient: false
            }
          };
        }
      }
    }

    return new Promise<SMTPTransportOutcome>((resolve) => {
      let socket: net.Socket | tls.TLSSocket;
      let buffer = '';
      let step = 'INIT';
      let mtaQueueId = mta_queue_id;
      let timer: NodeJS.Timeout;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (socket && !socket.destroyed) {
          socket.destroy();
        }
      };

      timer = setTimeout(() => {
        cleanup();
        resolve({
          status: 'TIMEOUT',
          smtp_response_code: 421,
          enhanced_status_code: '4.4.2',
          error_details: {
            code: 'MTA_CONNECTION_TIMEOUT',
            message: `Connection timed out after ${this.config.connectionTimeoutMs}ms during step ${step}`,
            is_transient: true
          }
        });
      }, this.config.connectionTimeoutMs);

      const sendLine = (line: string) => {
        socket.write(line + '\r\n');
      };

      const handleResponse = (code: number, msg: string) => {


        if (code >= 500) {
          cleanup();
          resolve({
            status: 'PERMANENT_FAILURE',
            smtp_response_code: code,
            enhanced_status_code: `5.${code % 100}.0`,
            error_details: {
              code: 'SMTP_5XX_ERROR',
              message: `MTA returned permanent error ${code}: ${msg}`,
              is_transient: false
            }
          });
          return;
        }

        if (code >= 400 && code < 500) {
          cleanup();
          resolve({
            status: 'TEMPORARY_FAILURE',
            smtp_response_code: code,
            enhanced_status_code: `4.${code % 100}.0`,
            error_details: {
              code: 'SMTP_4XX_DEFERRAL',
              message: `MTA returned transient deferral ${code}: ${msg}`,
              is_transient: true
            }
          });
          return;
        }

        switch (step) {
          case 'INIT':
            if (code === 220) {
              step = 'EHLO';
              sendLine(`EHLO ${this.config.heloHostname}`);
            }
            break;

          case 'EHLO':
            if (code === 250) {
              if (!this.config.secure && buffer.includes('STARTTLS')) {
                step = 'STARTTLS';
                sendLine('STARTTLS');
              } else if (this.config.user && this.config.password) {
                step = 'AUTH_LOGIN';
                sendLine('AUTH LOGIN');
              } else {
                step = 'MAIL_FROM';
                sendLine(`MAIL FROM:<${return_path}>`);
              }
            }
            break;

          case 'STARTTLS':
            if (code === 220) {
              // Upgrade socket to TLS
              const tlsSocket = tls.connect({
                socket: socket as net.Socket,
                host: this.config.host,
                rejectUnauthorized: false
              }, () => {
                socket = tlsSocket;
                step = 'EHLO_AFTER_TLS';
                sendLine(`EHLO ${this.config.heloHostname}`);
              });

              tlsSocket.on('data', onData);
              tlsSocket.on('error', onError);
            }
            break;

          case 'EHLO_AFTER_TLS':
            if (code === 250) {
              if (this.config.user && this.config.password) {
                step = 'AUTH_LOGIN';
                sendLine('AUTH LOGIN');
              } else {
                step = 'MAIL_FROM';
                sendLine(`MAIL FROM:<${return_path}>`);
              }
            }
            break;

          case 'AUTH_LOGIN':
            if (code === 334) {
              step = 'AUTH_USER';
              sendLine(Buffer.from(this.config.user || '').toString('base64'));
            }
            break;

          case 'AUTH_USER':
            if (code === 334) {
              step = 'AUTH_PASS';
              sendLine(Buffer.from(this.config.password || '').toString('base64'));
            }
            break;

          case 'AUTH_PASS':
            if (code === 235) {
              step = 'MAIL_FROM';
              sendLine(`MAIL FROM:<${return_path}>`);
            }
            break;

          case 'MAIL_FROM':
            if (code === 250) {
              step = 'RCPT_TO';
              sendLine(`RCPT TO:<${to}>`);
            }
            break;

          case 'RCPT_TO':
            if (code === 250 || code === 251) {
              step = 'DATA';
              sendLine('DATA');
            }
            break;

          case 'DATA':
            if (code === 354) {
              step = 'DATA_CONTENT';
              // Build RFC 5322 MIME Content
              const dateStr = new Date().toUTCString();
              const headers = [
                `Date: ${dateStr}`,
                `From: ${from}`,
                `To: ${to}`,
                `Subject: ${subject}`,
                `Message-ID: ${message_id}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/plain; charset=UTF-8`,
                `Content-Transfer-Encoding: 8bit`,
                `X-Atlas-Spool-ID: ${mta_queue_id}`
              ];

              if (custom_headers) {
                for (const [k, v] of Object.entries(custom_headers)) {
                  headers.push(`${k}: ${v}`);
                }
              }

              const rawMime = `${headers.join('\r\n')}\r\n\r\n${body}\r\n.\r\n`;
              socket.write(rawMime);
            }
            break;

          case 'DATA_CONTENT':
            if (code === 250) {
              // Extract queue-id if present in 250 response: e.g. "250 2.0.0 Ok: queued as 4X8z9P1kLlz1234"
              const qidMatch = msg.match(/queued as ([A-Za-z0-9]+)/i);
              if (qidMatch && qidMatch[1]) {
                mtaQueueId = qidMatch[1];
              }

              step = 'QUIT';
              sendLine('QUIT');

              cleanup();
              resolve({
                status: 'ACCEPTED',
                smtp_response_code: 250,
                enhanced_status_code: '2.0.0',
                mta_queue_id: mtaQueueId,
                provider_message_id: message_id
              });
            }
            break;

          case 'QUIT':
            cleanup();
            break;
        }
      };

      const onData = (data: Buffer) => {
        buffer += data.toString('utf-8');
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const codeMatch = line.match(/^([0-9]{3})([ -])(.*)$/);
          if (codeMatch) {
            const code = parseInt(codeMatch[1], 10);
            const isLastLine = codeMatch[2] === ' ';
            const msg = codeMatch[3];
            if (isLastLine) {
              handleResponse(code, msg);
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        resolve({
          status: 'AMBIGUOUS',
          smtp_response_code: 451,
          enhanced_status_code: '4.3.0',
          error_details: {
            code: 'SOCKET_ERROR',
            message: `SMTP socket error at step ${step}: ${err.message}`,
            is_transient: true
          }
        });
      };

      if (this.config.secure) {
        socket = tls.connect({
          host: this.config.host,
          port: this.config.port,
          rejectUnauthorized: false
        }, () => {
          step = 'INIT';
        });
      } else {
        socket = net.connect({
          host: this.config.host,
          port: this.config.port
        }, () => {
          step = 'INIT';
        });
      }

      socket.on('data', onData);
      socket.on('error', onError);
    });
  }
}
