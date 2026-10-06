/**
 * ATLAS MAIL ROUTER
 * @server/routes/mail/mailRoutes.ts
 * 
 * Express endpoints providing horizontal mail delivery capabilities to:
 * - Atlas Platform
 * - Busca Industrial
 * - YouApp
 * 
 * Strict isolation:
 * - Enforces product_scope on every call ('ATLAS' | 'INDUSTRIAL' | 'YOUAPP').
 * - Preserves global suppression invariants.
 * - Protects raw credentials and MTA internals.
 */

import { Router } from 'express';
import express from 'express';
import { AtlasMailService } from '../../services/atlas-mail/AtlasMailService.ts';
import type { ProductScope } from '../../../packages/types/index.ts';

export interface MailRouterDeps {
  mailService: AtlasMailService;
  resolveUserId: (req: express.Request, sbAdmin: any) => Promise<string | null>;
}

export function createMailRouter(deps: MailRouterDeps): Router {
  const router = Router();
  const { mailService } = deps;

  const validateProductScope = (req: express.Request, res: express.Response): ProductScope | null => {
    const scope = (req.body?.product_scope || req.query?.product_scope || req.headers['x-atlas-product-scope']) as string;
    if (!scope || !['ATLAS', 'INDUSTRIAL', 'YOUAPP'].includes(scope.toUpperCase())) {
      res.status(400).json({
        error: 'INVALID_PRODUCT_SCOPE',
        message: 'A valid product_scope (ATLAS, INDUSTRIAL, YOUAPP) is required.'
      });
      return null;
    }
    return scope.toUpperCase() as ProductScope;
  };

  // POST /api/mail/send-transactional
  router.post('/send-transactional', async (req, res) => {
    const product_scope = validateProductScope(req, res);
    if (!product_scope) return;

    const { to, subject, html, text, template_id, metadata } = req.body;
    if (!to || !subject) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', message: '"to" and "subject" are required.' });
      return;
    }

    try {
      const result = await mailService.sendTransactional({
        product_scope,
        to,
        subject,
        html,
        text,
        template_id,
        metadata
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error sending transactional mail' });
    }
  });

  // POST /api/mail/send-commercial
  router.post('/send-commercial', async (req, res) => {
    const product_scope = validateProductScope(req, res);
    if (!product_scope) return;

    const { to, subject, html, text, proposal_id, recipient_company, metadata } = req.body;
    if (!to || !subject) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', message: '"to" and "subject" are required.' });
      return;
    }

    try {
      const result = await mailService.sendCommercial({
        product_scope,
        to,
        subject,
        html,
        text,
        proposal_id,
        recipient_company,
        metadata
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error sending commercial mail' });
    }
  });

  // POST /api/mail/send-campaign
  router.post('/send-campaign', async (req, res) => {
    const product_scope = validateProductScope(req, res);
    if (!product_scope) return;

    const { campaign_id, template_id, recipients, metadata } = req.body;
    if (!campaign_id || !recipients || !Array.isArray(recipients)) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', message: '"campaign_id" and "recipients" array are required.' });
      return;
    }

    try {
      const result = await mailService.sendCampaign({
        product_scope,
        campaign_id,
        template_id,
        recipients,
        metadata
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error sending campaign' });
    }
  });

  // GET /api/mail/status/:messageId
  router.get('/status/:messageId', async (req, res) => {
    const product_scope = validateProductScope(req, res);
    if (!product_scope) return;

    const { messageId } = req.params;
    try {
      const status = await mailService.getDeliveryStatus(product_scope, messageId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error retrieving delivery status' });
    }
  });

  // GET /api/mail/suppression/:email
  router.get('/suppression/:email', async (req, res) => {
    const product_scope = validateProductScope(req, res);
    if (!product_scope) return;

    const { email } = req.params;
    try {
      const check = await mailService.checkSuppression(product_scope, email);
      res.json(check);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error checking suppression status' });
    }
  });

  // GET /api/mail/health
  router.get('/health', (req, res) => {
    res.json({
      status: 'HEALTHY',
      service: 'ATLAS_MAIL_CONTROL_PLANE',
      shared_scopes: ['ATLAS', 'INDUSTRIAL', 'YOUAPP'],
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

export default createMailRouter;
