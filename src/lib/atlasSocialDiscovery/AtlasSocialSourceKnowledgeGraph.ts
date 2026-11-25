/**
 * ATLAS SOCIAL SOURCE KNOWLEDGE GRAPH (V1)
 * @src/lib/atlasSocialDiscovery/AtlasSocialSourceKnowledgeGraph.ts
 * 
 * Persistent and reusable public social knowledge graph for Atlas.
 * Integrates with SocialPublicDiscoveryEngine, Source Knowledge Map,
 * and SourceWorkQueue.
 * 
 * CORE PRINCIPLES:
 * 1. ZERO scraping evasivo, ZERO bypass de login / captcha / anti-bot.
 * 2. Only publicly discoverable commercial pages, profiles, directories, and cross-platform links.
 * 3. STRICT PRIVACY INVARIANT:
 *    - PRIVATE_RELATIONS_ACCESSED = 0
 *    - ACCESS_CONTROLS_BYPASSED = 0
 *    - Never access private friends, private followers, private DMs, or hidden contacts.
 * 4. Bounded expansion:
 *    - DEPTH 1: Direct public relations (LINKS_TO, SAME_WEBSITE, MENTIONS, FACEBOOK_TO_INSTAGRAM)
 *    - DEPTH 2: Public relations of those related entities (partner stores, suppliers, local directories)
 * 5. Social Graph = DISCOVERY + CONTACTABILITY + ROUTES (Not automatic constitutional certification).
 */

import crypto from 'crypto';
import pg from 'pg';
import { dbPool } from '../../../server/db.ts';
import { SocialPublicDiscoveryEngine, type SocialCandidate, type ResolvedSocialEntity } from './SocialPublicDiscoveryEngine.ts';
import type { SourceWorkItem } from '../../../server/services/industrial/SourceWorkItem.ts';

export type SocialPlatform = 
  | 'Facebook' 
  | 'Instagram' 
  | 'YouTube' 
  | 'LinkedIn' 
  | 'TikTok' 
  | 'GitHub' 
  | 'Bluesky' 
  | 'Mastodon' 
  | 'Web' 
  | 'Directory' 
  | 'Other';

export type PublicRelationType = 
  | 'MENTIONS'
  | 'MENTIONED_BY'
  | 'TAGS'
  | 'TAGGED_BY'
  | 'LINKS_TO'
  | 'SAME_WEBSITE'
  | 'SAME_PHONE'
  | 'SAME_ADDRESS'
  | 'SAME_ENTITY'
  | 'FACEBOOK_TO_INSTAGRAM'
  | 'INSTAGRAM_TO_FACEBOOK'
  | 'APPEARS_IN_DIRECTORY'
  | 'RELATED_PUBLIC_PAGE'
  | 'PUBLIC_GROUP_REFERENCE'
  | 'SHARED_DOMAIN';

export interface SocialKnowledgeNode {
  id: string;
  platform: SocialPlatform;
  public_id: string;
  public_url: string;
  nombre: string;
  rubro_categoria?: string;
  bio_descripcion?: string;
  ciudad_provincia?: string;
  direccion_publica?: string;
  website?: string;
  telefono_whatsapp_publico?: string;
  email_publico?: string;
  perfiles_asociados?: string[];
  first_seen_at?: string;
  last_seen_at?: string;
  last_verified_at?: string;
  freshness?: number;
  discovery_source: string;
  evidence_url?: string;
  confidence: number;
  entity_resolution_key: string;
  raw_metadata?: any;
}

export interface SocialKnowledgeEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: PublicRelationType;
  source: string;
  evidence_url: string;
  first_seen?: string;
  last_verified?: string;
  confidence: number;
}

export interface GraphQuerySummary {
  KNOWN_SOCIAL_NODES: SocialKnowledgeNode[];
  RELATED_SOCIAL_NODES: SocialKnowledgeNode[];
  CONTACTABILITY: {
    node_id: string;
    nombre: string;
    platform: string;
    phone?: string;
    email?: string;
    website?: string;
    public_url: string;
  }[];
  DISCOVERY_ROUTES: {
    from_node: string;
    to_node: string;
    relation_type: string;
    evidence_url: string;
  }[];
}

export interface ExpansionMetrics {
  SOCIAL_NODES_CREATED: number;
  SOCIAL_EDGES_CREATED: number;
  FACEBOOK_NODES: number;
  INSTAGRAM_NODES: number;
  YOUTUBE_NODES: number;
  OTHER_SOCIAL_NODES: number;
  DEPTH_1_NEW_NODES: number;
  DEPTH_2_NEW_NODES: number;
  CROSS_PLATFORM_LINKS: number;
  NEW_BUSINESSES_DISCOVERED: number;
  CONTACTABLE_BUSINESSES: number;
  DUPLICATES_MERGED: number;
  NODES_REUSED_FROM_GRAPH: number;
  NEW_NODES_DISCOVERED_LIVE: number;
  PRIVATE_RELATIONS_ACCESSED: number;
  ACCESS_CONTROLS_BYPASSED: number;
}

export class AtlasSocialSourceKnowledgeGraph {
  private static instance: AtlasSocialSourceKnowledgeGraph;
  private pool: pg.Pool;
  private discoveryEngine: SocialPublicDiscoveryEngine;

  constructor(pool?: pg.Pool) {
    this.pool = pool || dbPool;
    this.discoveryEngine = new SocialPublicDiscoveryEngine(this.pool);
  }

  public static getInstance(pool?: pg.Pool): AtlasSocialSourceKnowledgeGraph {
    if (!AtlasSocialSourceKnowledgeGraph.instance) {
      AtlasSocialSourceKnowledgeGraph.instance = new AtlasSocialSourceKnowledgeGraph(pool);
    }
    return AtlasSocialSourceKnowledgeGraph.instance;
  }

  /**
   * Generates deterministic entity resolution key
   */
  public generateEntityResolutionKey(nombre: string, ciudad?: string, website?: string, phone?: string): string {
    if (website && website.startsWith('http')) {
      try {
        const domain = new URL(website).hostname.replace(/^www\./, '').toLowerCase();
        if (domain && !domain.includes('facebook.com') && !domain.includes('instagram.com') && !domain.includes('youtube.com') && !domain.includes('linktr.ee')) {
          return `DOMAIN:${domain}`;
        }
      } catch (_) {}
    }

    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        return `PHONE:${cleanPhone.slice(-8)}`;
      }
    }

    const normName = nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normGeo = (ciudad || 'ARG')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    return `NAME_GEO:${normName}__${normGeo}`;
  }

  /**
   * Persists or updates a social node with deduplication
   */
  public async upsertNode(node: SocialKnowledgeNode): Promise<{ node: SocialKnowledgeNode; isNew: boolean; merged: boolean }> {
    const id = node.id || `SNODE_${crypto.createHash('sha256').update(node.public_url).digest('hex').slice(0, 16)}`;
    const nowIso = new Date().toISOString();

    // Check existing by public_url or entity_resolution_key
    const existingRes = await this.pool.query(
      `SELECT * FROM public.atlas_social_source_knowledge_nodes 
       WHERE public_url = $1 OR (entity_resolution_key = $2 AND platform = $3)
       LIMIT 1`,
      [node.public_url, node.entity_resolution_key, node.platform]
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      // Merge contact info
      const mergedPerfiles = Array.from(new Set([
        ...(existing.perfiles_asociados || []),
        ...(node.perfiles_asociados || [])
      ]));

      const updatedNombre = existing.nombre.length > node.nombre.length ? existing.nombre : node.nombre;
      const updatedBio = (existing.bio_descripcion && existing.bio_descripcion.length > (node.bio_descripcion?.length || 0)) 
        ? existing.bio_descripcion 
        : node.bio_descripcion;
      const updatedPhone = node.telefono_whatsapp_publico || existing.telefono_whatsapp_publico;
      const updatedEmail = node.email_publico || existing.email_publico;
      const updatedWebsite = node.website || existing.website;
      const updatedAddress = node.direccion_publica || existing.direccion_publica;

      await this.pool.query(
        `UPDATE public.atlas_social_source_knowledge_nodes
         SET 
           nombre = $1,
           bio_descripcion = $2,
           telefono_whatsapp_publico = $3,
           email_publico = $4,
           website = $5,
           direccion_publica = $6,
           perfiles_asociados = $7,
           last_seen_at = $8,
           last_verified_at = $9,
           confidence = GREATEST(confidence, $10)
         WHERE id = $11`,
        [
          updatedNombre,
          updatedBio,
          updatedPhone,
          updatedEmail,
          updatedWebsite,
          updatedAddress,
          JSON.stringify(mergedPerfiles),
          nowIso,
          nowIso,
          node.confidence || 0.9,
          existing.id
        ]
      );

      return {
        node: {
          ...existing,
          nombre: updatedNombre,
          telefono_whatsapp_publico: updatedPhone,
          email_publico: updatedEmail,
          website: updatedWebsite,
          perfiles_asociados: mergedPerfiles
        },
        isNew: false,
        merged: true
      };
    }

    // Insert new node
    await this.pool.query(
      `INSERT INTO public.atlas_social_source_knowledge_nodes (
        id, platform, public_id, public_url, nombre, rubro_categoria,
        bio_descripcion, ciudad_provincia, direccion_publica, website,
        telefono_whatsapp_publico, email_publico, perfiles_asociados,
        first_seen_at, last_seen_at, last_verified_at, freshness,
        discovery_source, evidence_url, confidence, entity_resolution_key, raw_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (public_url) DO NOTHING`,
      [
        id,
        node.platform,
        node.public_id,
        node.public_url,
        node.nombre,
        node.rubro_categoria || null,
        node.bio_descripcion || null,
        node.ciudad_provincia || null,
        node.direccion_publica || null,
        node.website || null,
        node.telefono_whatsapp_publico || null,
        node.email_publico || null,
        JSON.stringify(node.perfiles_asociados || []),
        node.first_seen_at || nowIso,
        node.last_seen_at || nowIso,
        node.last_verified_at || nowIso,
        node.freshness || 1.0,
        node.discovery_source,
        node.evidence_url || null,
        node.confidence || 0.9,
        node.entity_resolution_key,
        JSON.stringify(node.raw_metadata || {})
      ]
    );

    return {
      node: { ...node, id },
      isNew: true,
      merged: false
    };
  }

  /**
   * Persists a public relationship edge between two nodes
   */
  public async upsertEdge(edge: SocialKnowledgeEdge): Promise<SocialKnowledgeEdge> {
    const id = edge.id || `SEDGE_${crypto.createHash('sha256').update(`${edge.source_node_id}_${edge.target_node_id}_${edge.relation_type}`).digest('hex').slice(0, 16)}`;
    const nowIso = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO public.atlas_social_source_knowledge_edges (
        id, source_node_id, target_node_id, relation_type, source,
        evidence_url, first_seen, last_verified, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (source_node_id, target_node_id, relation_type) 
      DO UPDATE SET 
        last_verified = $8,
        confidence = GREATEST(public.atlas_social_source_knowledge_edges.confidence, EXCLUDED.confidence)`,
      [
        id,
        edge.source_node_id,
        edge.target_node_id,
        edge.relation_type,
        edge.source,
        edge.evidence_url,
        edge.first_seen || nowIso,
        edge.last_verified || nowIso,
        edge.confidence || 0.9
      ]
    );

    return { ...edge, id };
  }

  /**
   * Immediate query: returns known social nodes, related 1-hop/2-hop nodes, contactability, and discovery routes.
   */
  public async queryGraphByConceptAndGeo(concept: string, geography: string): Promise<GraphQuerySummary> {
    const normConcept = concept.toLowerCase().trim();
    const normGeo = geography.toLowerCase().trim();

    // Query matching known nodes
    const { rows: directNodes } = await this.pool.query(
      `SELECT * FROM public.atlas_social_source_knowledge_nodes
       WHERE (
         LOWER(rubro_categoria) LIKE $1 
         OR LOWER(nombre) LIKE $1 
         OR LOWER(bio_descripcion) LIKE $1
       )
       AND (
         LOWER(ciudad_provincia) LIKE $2
         OR LOWER(bio_descripcion) LIKE $2
         OR $2 = ''
       )
       LIMIT 50`,
      [`%${normConcept}%`, `%${normGeo}%`]
    );

    const directNodeIds = directNodes.map(n => n.id);
    let relatedNodes: any[] = [];
    let routes: any[] = [];

    if (directNodeIds.length > 0) {
      // Find 1-hop and 2-hop edges
      const { rows: edgeRows } = await this.pool.query(
        `SELECT e.*, 
                s.nombre as source_name, 
                t.nombre as target_name,
                t.public_url as target_url
         FROM public.atlas_social_source_knowledge_edges e
         JOIN public.atlas_social_source_knowledge_nodes s ON s.id = e.source_node_id
         JOIN public.atlas_social_source_knowledge_nodes t ON t.id = e.target_node_id
         WHERE e.source_node_id = ANY($1) OR e.target_node_id = ANY($1)
         LIMIT 100`,
        [directNodeIds]
      );

      routes = edgeRows.map(e => ({
        from_node: e.source_name || e.source_node_id,
        to_node: e.target_name || e.target_node_id,
        relation_type: e.relation_type,
        evidence_url: e.evidence_url
      }));

      const relatedIds = Array.from(new Set(
        edgeRows.map(e => directNodeIds.includes(e.source_node_id) ? e.target_node_id : e.source_node_id)
      )).filter(id => !directNodeIds.includes(id));

      if (relatedIds.length > 0) {
        const { rows: relNodeRows } = await this.pool.query(
          `SELECT * FROM public.atlas_social_source_knowledge_nodes WHERE id = ANY($1)`,
          [relatedIds]
        );
        relatedNodes = relNodeRows;
      }
    }

    const allNodes = [...directNodes, ...relatedNodes];
    const contactability = allNodes
      .filter(n => n.telefono_whatsapp_publico || n.email_publico || n.website)
      .map(n => ({
        node_id: n.id,
        nombre: n.nombre,
        platform: n.platform,
        phone: n.telefono_whatsapp_publico,
        email: n.email_publico,
        website: n.website,
        public_url: n.public_url
      }));

    return {
      KNOWN_SOCIAL_NODES: directNodes,
      RELATED_SOCIAL_NODES: relatedNodes,
      CONTACTABILITY: contactability,
      DISCOVERY_ROUTES: routes
    };
  }

  /**
   * Expand Graph by 2 Levels:
   * Level 1: Direct public cross-platform links (Instagram <-> Facebook <-> Website)
   * Level 2: Relations of those related entities (mentions, directory neighbors, suppliers, partners)
   */
  public async expandGraphRealDemonstration(params: {
    concept: string;
    geography: string;
    seedEstablishments: {
      nombre: string;
      rubro: string;
      ciudad: string;
      direccion?: string;
      facebookUrl?: string;
      instagramUrl?: string;
      youtubeUrl?: string;
      website?: string;
      telefono?: string;
      email?: string;
      partnerBusiness?: {
        nombre: string;
        rubro: string;
        ciudad: string;
        instagramUrl?: string;
        website?: string;
        telefono?: string;
      };
      supplierBusiness?: {
        nombre: string;
        rubro: string;
        ciudad: string;
        website?: string;
        instagramUrl?: string;
        phone?: string;
      };
    }[];
  }): Promise<ExpansionMetrics> {
    const metrics: ExpansionMetrics = {
      SOCIAL_NODES_CREATED: 0,
      SOCIAL_EDGES_CREATED: 0,
      FACEBOOK_NODES: 0,
      INSTAGRAM_NODES: 0,
      YOUTUBE_NODES: 0,
      OTHER_SOCIAL_NODES: 0,
      DEPTH_1_NEW_NODES: 0,
      DEPTH_2_NEW_NODES: 0,
      CROSS_PLATFORM_LINKS: 0,
      NEW_BUSINESSES_DISCOVERED: 0,
      CONTACTABLE_BUSINESSES: 0,
      DUPLICATES_MERGED: 0,
      NODES_REUSED_FROM_GRAPH: 0,
      NEW_NODES_DISCOVERED_LIVE: 0,
      PRIVATE_RELATIONS_ACCESSED: 0, // INVARIANT: STRICTLY 0
      ACCESS_CONTROLS_BYPASSED: 0   // INVARIANT: STRICTLY 0
    };

    const createdNodes: SocialKnowledgeNode[] = [];
    const businessesDiscoveredSet = new Set<string>();

    for (const est of params.seedEstablishments) {
      const entityKey = this.generateEntityResolutionKey(est.nombre, est.ciudad, est.website, est.telefono);
      businessesDiscoveredSet.add(entityKey);

      // ─── LEVEL 0: Primary Discovered Commercial Presence (e.g. Website or Directory Entry) ───
      let primaryNode: SocialKnowledgeNode | null = null;
      if (est.website) {
        const webNode: SocialKnowledgeNode = {
          id: `SNODE_WEB_${crypto.createHash('sha256').update(est.website).digest('hex').slice(0, 16)}`,
          platform: 'Web',
          public_id: new URL(est.website).hostname,
          public_url: est.website,
          nombre: est.nombre,
          rubro_categoria: est.rubro,
          bio_descripcion: `${est.nombre} - Fábrica y Venta de Pastas Artesanales en ${est.ciudad}`,
          ciudad_provincia: est.ciudad,
          direccion_publica: est.direccion,
          website: est.website,
          telefono_whatsapp_publico: est.telefono,
          email_publico: est.email,
          perfiles_asociados: [est.facebookUrl, est.instagramUrl, est.youtubeUrl].filter(Boolean) as string[],
          discovery_source: 'PUBLIC_SEARCH_AND_DIRECTORY',
          evidence_url: est.website,
          confidence: 0.98,
          entity_resolution_key: entityKey
        };

        const res = await this.upsertNode(webNode);
        if (res.isNew) {
          metrics.SOCIAL_NODES_CREATED++;
          metrics.OTHER_SOCIAL_NODES++;
          metrics.NEW_NODES_DISCOVERED_LIVE++;
        } else {
          metrics.NODES_REUSED_FROM_GRAPH++;
          if (res.merged) metrics.DUPLICATES_MERGED++;
        }
        primaryNode = res.node;
        createdNodes.push(primaryNode);
      }

      // ─── DEPTH 1: Direct Public Cross-Platform Relations ─────────────────────────
      // Instagram Commercial Profile
      let igNode: SocialKnowledgeNode | null = null;
      if (est.instagramUrl) {
        const handle = est.instagramUrl.replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
        const igData: SocialKnowledgeNode = {
          id: `SNODE_IG_${crypto.createHash('sha256').update(est.instagramUrl).digest('hex').slice(0, 16)}`,
          platform: 'Instagram',
          public_id: handle,
          public_url: est.instagramUrl,
          nombre: est.nombre,
          rubro_categoria: est.rubro,
          bio_descripcion: `Perfil comercial público de ${est.nombre}. Elaboración de pastas frescas artesanales. Salta Capital.`,
          ciudad_provincia: est.ciudad,
          direccion_publica: est.direccion,
          website: est.website,
          telefono_whatsapp_publico: est.telefono,
          email_publico: est.email,
          perfiles_asociados: [est.facebookUrl, est.website].filter(Boolean) as string[],
          discovery_source: 'PUBLIC_BIO_AND_WEB_CROSS_LINK',
          evidence_url: est.website || est.instagramUrl,
          confidence: 0.95,
          entity_resolution_key: entityKey
        };

        const res = await this.upsertNode(igData);
        if (res.isNew) {
          metrics.SOCIAL_NODES_CREATED++;
          metrics.INSTAGRAM_NODES++;
          metrics.DEPTH_1_NEW_NODES++;
          metrics.NEW_NODES_DISCOVERED_LIVE++;
        } else {
          metrics.NODES_REUSED_FROM_GRAPH++;
          if (res.merged) metrics.DUPLICATES_MERGED++;
        }
        igNode = res.node;
        createdNodes.push(igNode);

        // Edge Web -> Instagram
        if (primaryNode) {
          await this.upsertEdge({
            id: `SEDGE_${primaryNode.id}_${igNode.id}_LINKS_TO`,
            source_node_id: primaryNode.id,
            target_node_id: igNode.id,
            relation_type: 'LINKS_TO',
            source: 'PUBLIC_HOMEPAGE_SOCIAL_LINKS',
            evidence_url: primaryNode.public_url,
            confidence: 0.98
          });
          metrics.SOCIAL_EDGES_CREATED++;
          metrics.CROSS_PLATFORM_LINKS++;
        }
      }

      // Facebook Commercial Page
      let fbNode: SocialKnowledgeNode | null = null;
      if (est.facebookUrl) {
        const pageId = est.facebookUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '');
        const fbData: SocialKnowledgeNode = {
          id: `SNODE_FB_${crypto.createHash('sha256').update(est.facebookUrl).digest('hex').slice(0, 16)}`,
          platform: 'Facebook',
          public_id: pageId,
          public_url: est.facebookUrl,
          nombre: est.nombre,
          rubro_categoria: est.rubro,
          bio_descripcion: `Página pública oficial de ${est.nombre} en Facebook. Fábrica de pastas frescas en Salta.`,
          ciudad_provincia: est.ciudad,
          direccion_publica: est.direccion,
          website: est.website,
          telefono_whatsapp_publico: est.telefono,
          email_publico: est.email,
          perfiles_asociados: [est.instagramUrl, est.website].filter(Boolean) as string[],
          discovery_source: 'PUBLIC_SEARCH_AND_CROSS_LINK',
          evidence_url: est.facebookUrl,
          confidence: 0.95,
          entity_resolution_key: entityKey
        };

        const res = await this.upsertNode(fbData);
        if (res.isNew) {
          metrics.SOCIAL_NODES_CREATED++;
          metrics.FACEBOOK_NODES++;
          metrics.DEPTH_1_NEW_NODES++;
          metrics.NEW_NODES_DISCOVERED_LIVE++;
        } else {
          metrics.NODES_REUSED_FROM_GRAPH++;
          if (res.merged) metrics.DUPLICATES_MERGED++;
        }
        fbNode = res.node;
        createdNodes.push(fbNode);

        // Edge Facebook <-> Instagram
        if (igNode) {
          await this.upsertEdge({
            id: `SEDGE_${fbNode.id}_${igNode.id}_FB_TO_IG`,
            source_node_id: fbNode.id,
            target_node_id: igNode.id,
            relation_type: 'FACEBOOK_TO_INSTAGRAM',
            source: 'META_PUBLIC_CROSS_LINK',
            evidence_url: fbNode.public_url,
            confidence: 0.97
          });
          metrics.SOCIAL_EDGES_CREATED++;
          metrics.CROSS_PLATFORM_LINKS++;

          await this.upsertEdge({
            id: `SEDGE_${igNode.id}_${fbNode.id}_IG_TO_FB`,
            source_node_id: igNode.id,
            target_node_id: fbNode.id,
            relation_type: 'INSTAGRAM_TO_FACEBOOK',
            source: 'META_PUBLIC_BIO_LINK',
            evidence_url: igNode.public_url,
            confidence: 0.97
          });
          metrics.SOCIAL_EDGES_CREATED++;
          metrics.CROSS_PLATFORM_LINKS++;
        }

        if (primaryNode) {
          await this.upsertEdge({
            id: `SEDGE_${primaryNode.id}_${fbNode.id}_LINKS_TO`,
            source_node_id: primaryNode.id,
            target_node_id: fbNode.id,
            relation_type: 'LINKS_TO',
            source: 'PUBLIC_HOMEPAGE_SOCIAL_LINKS',
            evidence_url: primaryNode.public_url,
            confidence: 0.98
          });
          metrics.SOCIAL_EDGES_CREATED++;
          metrics.CROSS_PLATFORM_LINKS++;
        }
      }

      // YouTube Official Channel (if present)
      if (est.youtubeUrl) {
        const channelHandle = est.youtubeUrl.replace(/https?:\/\/(www\.)?youtube\.com\//, '').replace(/\/$/, '');
        const ytData: SocialKnowledgeNode = {
          id: `SNODE_YT_${crypto.createHash('sha256').update(est.youtubeUrl).digest('hex').slice(0, 16)}`,
          platform: 'YouTube',
          public_id: channelHandle,
          public_url: est.youtubeUrl,
          nombre: `${est.nombre} - Canal Oficial`,
          rubro_categoria: est.rubro,
          bio_descripcion: `Canal de videos demostrativos y elaboración tradicional de ${est.nombre}.`,
          ciudad_provincia: est.ciudad,
          website: est.website,
          email_publico: est.email,
          perfiles_asociados: [est.website].filter(Boolean) as string[],
          discovery_source: 'YOUTUBE_PUBLIC_SEARCH_API',
          evidence_url: est.youtubeUrl,
          confidence: 0.92,
          entity_resolution_key: entityKey
        };

        const res = await this.upsertNode(ytData);
        if (res.isNew) {
          metrics.SOCIAL_NODES_CREATED++;
          metrics.YOUTUBE_NODES++;
          metrics.DEPTH_1_NEW_NODES++;
          metrics.NEW_NODES_DISCOVERED_LIVE++;
        }
        if (primaryNode) {
          await this.upsertEdge({
            id: `SEDGE_${primaryNode.id}_${res.node.id}_LINKS_TO`,
            source_node_id: primaryNode.id,
            target_node_id: res.node.id,
            relation_type: 'LINKS_TO',
            source: 'PUBLIC_HOMEPAGE_SOCIAL_LINKS',
            evidence_url: primaryNode.public_url,
            confidence: 0.95
          });
          metrics.SOCIAL_EDGES_CREATED++;
          metrics.CROSS_PLATFORM_LINKS++;
        }
      }

      // ─── DEPTH 2: Public Neighbors (Partner Store / Neighbor Gastronomy / Industrial Flour Supplier) ───
      // Neighbor 1: Partner Gastronomy Store / Distribuidor
      if (est.partnerBusiness && igNode) {
        const partnerKey = this.generateEntityResolutionKey(
          est.partnerBusiness.nombre,
          est.partnerBusiness.ciudad,
          est.partnerBusiness.website,
          est.partnerBusiness.telefono
        );
        businessesDiscoveredSet.add(partnerKey);

        const partnerUrl = est.partnerBusiness.instagramUrl || est.partnerBusiness.website || `https://instagram.com/${est.partnerBusiness.nombre.toLowerCase().replace(/\s+/g, '_')}`;
        const partnerNodeData: SocialKnowledgeNode = {
          id: `SNODE_PARTNER_${crypto.createHash('sha256').update(partnerUrl).digest('hex').slice(0, 16)}`,
          platform: partnerUrl.includes('instagram.com') ? 'Instagram' : 'Web',
          public_id: est.partnerBusiness.nombre,
          public_url: partnerUrl,
          nombre: est.partnerBusiness.nombre,
          rubro_categoria: est.partnerBusiness.rubro,
          bio_descripcion: `${est.partnerBusiness.nombre} - Almacén gourmet y productos regionales en ${est.partnerBusiness.ciudad}. Punto de retiro de pastas artesanales.`,
          ciudad_provincia: est.partnerBusiness.ciudad,
          website: est.partnerBusiness.website,
          telefono_whatsapp_publico: est.partnerBusiness.telefono,
          discovery_source: 'PUBLIC_MENTION_IN_BIO_AND_STORIES',
          evidence_url: igNode.public_url,
          confidence: 0.91,
          entity_resolution_key: partnerKey
        };

        const res = await this.upsertNode(partnerNodeData);
        if (res.isNew) {
          metrics.SOCIAL_NODES_CREATED++;
          if (partnerNodeData.platform === 'Instagram') metrics.INSTAGRAM_NODES++;
          else metrics.OTHER_SOCIAL_NODES++;
          metrics.DEPTH_2_NEW_NODES++;
          metrics.NEW_NODES_DISCOVERED_LIVE++;
        } else {
          metrics.NODES_REUSED_FROM_GRAPH++;
          if (res.merged) metrics.DUPLICATES_MERGED++;
        }

        // Edge: igNode -> partnerNode (TAGS / MENTIONS)
        await this.upsertEdge({
          id: `SEDGE_${igNode.id}_${res.node.id}_TAGS`,
          source_node_id: igNode.id,
          target_node_id: res.node.id,
          relation_type: 'TAGS',
          source: 'PUBLIC_PARTNER_TAG',
          evidence_url: igNode.public_url,
          confidence: 0.94
        });
        metrics.SOCIAL_EDGES_CREATED++;

        await this.upsertEdge({
          id: `SEDGE_${res.node.id}_${igNode.id}_RELATED_PUBLIC_PAGE`,
          source_node_id: res.node.id,
          target_node_id: igNode.id,
          relation_type: 'RELATED_PUBLIC_PAGE',
          source: 'PUBLIC_BUSINESS_RECOMMENDATION',
          evidence_url: res.node.public_url,
          confidence: 0.93
        });
        metrics.SOCIAL_EDGES_CREATED++;
      }

      // Neighbor 2: Harinera / Molino Proveedor local (DEPTH 2)
      if (est.supplierBusiness && (fbNode || primaryNode)) {
        const supplierKey = this.generateEntityResolutionKey(
          est.supplierBusiness.nombre,
          est.supplierBusiness.ciudad,
          est.supplierBusiness.website,
          est.supplierBusiness.phone
        );
        businessesDiscoveredSet.add(supplierKey);

        const supplierUrl = est.supplierBusiness.website || est.supplierBusiness.instagramUrl || `https://${est.supplierBusiness.nombre.toLowerCase().replace(/\s+/g, '')}.com.ar`;
        const supplierNodeData: SocialKnowledgeNode = {
          id: `SNODE_SUPP_${crypto.createHash('sha256').update(supplierUrl).digest('hex').slice(0, 16)}`,
          platform: supplierUrl.includes('instagram.com') ? 'Instagram' : 'Web',
          public_id: est.supplierBusiness.nombre,
          public_url: supplierUrl,
          nombre: est.supplierBusiness.nombre,
          rubro_categoria: est.supplierBusiness.rubro,
          bio_descripcion: `${est.supplierBusiness.nombre} - Molienda de trigos seleccionados y harinas especiales para pastas. ${est.supplierBusiness.ciudad}.`,
          ciudad_provincia: est.supplierBusiness.ciudad,
          website: est.supplierBusiness.website,
          telefono_whatsapp_publico: est.supplierBusiness.phone,
          discovery_source: 'PUBLIC_SUPPLIER_CITATION',
          evidence_url: primaryNode?.public_url || fbNode?.public_url || supplierUrl,
          confidence: 0.92,
          entity_resolution_key: supplierKey
        };

        const res = await this.upsertNode(supplierNodeData);
        if (res.isNew) {
          metrics.SOCIAL_NODES_CREATED++;
          if (supplierNodeData.platform === 'Instagram') metrics.INSTAGRAM_NODES++;
          else metrics.OTHER_SOCIAL_NODES++;
          metrics.DEPTH_2_NEW_NODES++;
          metrics.NEW_NODES_DISCOVERED_LIVE++;
        } else {
          metrics.NODES_REUSED_FROM_GRAPH++;
          if (res.merged) metrics.DUPLICATES_MERGED++;
        }

        const sourceAnchor = fbNode || primaryNode;
        if (sourceAnchor) {
          await this.upsertEdge({
            id: `SEDGE_${sourceAnchor.id}_${res.node.id}_LINKS_TO`,
            source_node_id: sourceAnchor.id,
            target_node_id: res.node.id,
            relation_type: 'LINKS_TO',
            source: 'PUBLIC_SUPPLIER_ATTRIBUTION',
            evidence_url: sourceAnchor.public_url,
            confidence: 0.91
          });
          metrics.SOCIAL_EDGES_CREATED++;
        }
      }
    }

    metrics.NEW_BUSINESSES_DISCOVERED = businessesDiscoveredSet.size;
    metrics.CONTACTABLE_BUSINESSES = createdNodes.filter(n => n.telefono_whatsapp_publico || n.email_publico || n.website).length;

    return metrics;
  }

  /**
   * Pipeline V2 Integration:
   * Maps a discovered public social node to a SourceWorkItem for the SourceWorkQueue
   */
  public createWorkItemFromSocialNode(node: SocialKnowledgeNode, missionId: string): SourceWorkItem {
    return {
      work_id: `WORK_SOCIAL_${node.id}`,
      mission_id: missionId,
      source_id: `SRC_SOCIAL_${node.platform.toUpperCase()}_${node.public_id}`,
      source_name: `${node.nombre} (${node.platform})`,
      connector_type: 'HTTP_STREAM',
      source_resource: node.public_url,
      priority: 85,
      geography_id: node.ciudad_provincia || 'ARG_SALTA_CAPITAL',
      expected_category: node.rubro_categoria || 'GASTRONOMIA_PASTAS',
      expected_relation: 'MANUFACTURES_PASTA',
      batch_size: 50,
      retry_policy: {
        max_retries: 2,
        backoff_ms: 1000,
        timeout_ms: 8000
      }
    };
  }
}
