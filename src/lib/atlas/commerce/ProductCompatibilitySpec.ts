/**
 * ATLAS COMMERCE — PRODUCT COMPATIBILITY SPECIFICATION
 * Module: ProductCompatibilitySpec.ts
 * Path: src/lib/atlas/commerce/ProductCompatibilitySpec.ts
 * 
 * Formal data contract defining the compatibility boundaries and targeting
 * parameters of any product in Atlas Commerce.
 * 
 * ZERO HARDCODED CODE LOGIC:
 * All domain, profession, industry, use case, and negative compatibility
 * rules are expressed purely as data specifications.
 */

export type UsageContext = 'PERSONAL' | 'PROFESSIONAL' | 'BUSINESS' | 'INDUSTRIAL' | 'RETAIL';
export type BuyerType = 'COMPANY' | 'PERSON' | 'ORGANIZATION';
export const BuyerType = {};
export type PurchaseFrequency = 'ONE_OFF' | 'RECURRING_MONTHLY' | 'RECURRING_ANNUAL' | 'CONSUMABLE';
export const PurchaseFrequency = {};
export const UsageContext = {};
export const ProductCompatibilitySpec = {};

export type ProductHorizontalClassification = 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL';

export interface ProductCompatibilitySpec {
  /** Allowed buyer entity types. If buyer type is not in this list, match is strictly 0.00 */
  buyer_types: BuyerType[];
  primary_buyer_types?: BuyerType[];

  /** Practical usage context: PERSONAL, PROFESSIONAL, BUSINESS, INDUSTRIAL, RETAIL */
  usage_context: UsageContext[];

  /** High-level product domain: WHAT_THE_PRODUCT_IS (e.g. ENTERPRISE_SOFTWARE, PROFESSIONAL_INSURANCE, INDUSTRIAL_TOOLS) */
  product_domain: string;

  /** Generic horizontal vs vertical classification: HORIZONTAL, VERTICAL, or SEMI_HORIZONTAL */
  horizontal_classification?: ProductHorizontalClassification;

  /** Primary operational use cases */
  use_cases: string[];

  /** Core buyer needs that this product solves (e.g. GESTION_NOMINA, PERFORACION_OBRA, NUTRICION_ANIMAL) */
  primary_buyer_needs?: string[];

  /** Operating contexts of the buyer where the product is utilized */
  buyer_operating_contexts?: string[];

  /** Target industries with positive affinity: WHO_USES_OR_BUYS_IT */
  target_industries: string[];

  /** Core positive buyer industries */
  buyer_industries_positive?: string[];

  /** Neutral buyer industries (may buy under secondary or facility maintenance use case) */
  buyer_industries_neutral?: string[];

  /** Industries where product is strictly incompatible */
  excluded_industries: string[];
  buyer_industries_excluded?: string[];

  /** Target professions, roles or occupations */
  target_professions: string[];

  /** Professions where product is strictly incompatible */
  excluded_professions: string[];

  /** Buyer attributes that MUST be present (if non-empty, absence penalizes heavily) */
  required_buyer_attributes: string[];
  buyer_attributes_required?: string[];

  /** Buyer attributes that enhance affinity score */
  preferred_buyer_attributes: string[];
  buyer_attributes_preferred?: string[];

  /** Buyer attributes that trigger strict negative incompatibility */
  incompatible_buyer_attributes: string[];

  /** Purchasing frequency profile */
  purchase_frequency?: PurchaseFrequency;

  /** Key evidence requirements needed to establish high confidence */
  evidence_requirements?: string[];

  /** If true, product is a horizontal general commodity (paper, basic desks) with lower primary affinity cap */
  is_horizontal_commodity?: boolean;
}
