/**
 * Atlas Semantic Intelligence — Predicate Registry V1
 * Governed predicate definitions, domain/range validation, and literal value type checking.
 */

import type { CanonicalEntityType } from './types';
import type {
  SemanticPredicateDefinition,
  LiteralValueType,
  ObjectKind
} from './semanticTypes';

export class PredicateRegistry {
  private static readonly CORE_PREDICATES: Map<string, SemanticPredicateDefinition> = new Map([
    // Relationships (Entity -> Entity)
    [
      'WORKS_AT',
      {
        predicate_code: 'WORKS_AT',
        subject_entity_types: ['PERSON'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['COMPANY', 'ORGANIZATION'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Person works at an organization'
      }
    ],
    [
      'FOUNDED_BY',
      {
        predicate_code: 'FOUNDED_BY',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['PERSON'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'STATIC',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Organization founded by a person'
      }
    ],
    [
      'LOCATED_IN',
      {
        predicate_code: 'LOCATED_IN',
        subject_entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION', 'SERVICE'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['LOCATION'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Entity located in a geographic location'
      }
    ],
    [
      'HEADQUARTERED_IN',
      {
        predicate_code: 'HEADQUARTERED_IN',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['LOCATION'],
        cardinality: 'SINGLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'TEMPORAL_SINGLE_VALUE',
        is_active: true,
        version: 1,
        description: 'Primary corporate headquarters location'
      }
    ],
    [
      'OFFERS',
      {
        predicate_code: 'OFFERS',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['PRODUCT', 'SERVICE'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Organization provides product or service'
      }
    ],
    [
      'EMPLOYS',
      {
        predicate_code: 'EMPLOYS',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['PERSON'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Organization employs a person'
      }
    ],
    [
      'INTERESTED_IN',
      {
        predicate_code: 'INTERESTED_IN',
        subject_entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['PRODUCT', 'SERVICE'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Expressed interest in product or service'
      }
    ],
    [
      'HAS_NEED',
      {
        predicate_code: 'HAS_NEED',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['SERVICE', 'PRODUCT'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Operational need for product or service'
      }
    ],
    [
      'OPENED_LOCATION',
      {
        predicate_code: 'OPENED_LOCATION',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['LOCATION'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'POINT_IN_TIME',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Opened a new location'
      }
    ],
    [
      'EXPANDED_TO',
      {
        predicate_code: 'EXPANDED_TO',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['LOCATION'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'POINT_IN_TIME',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Expanded market or operations to location'
      }
    ],
    [
      'ASSOCIATED_WITH',
      {
        predicate_code: 'ASSOCIATED_WITH',
        subject_entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION', 'PRODUCT', 'SERVICE', 'LOCATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION', 'PRODUCT', 'SERVICE', 'LOCATION'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'General semantic association between entities'
      }
    ],
    [
      'OWNS',
      {
        predicate_code: 'OWNS',
        subject_entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['COMPANY', 'ORGANIZATION', 'PRODUCT'],
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Ownership relationship'
      }
    ],
    [
      'BELONGS_TO',
      {
        predicate_code: 'BELONGS_TO',
        subject_entity_types: ['PRODUCT', 'SERVICE'],
        object_kind: 'CANONICAL_ENTITY',
        object_entity_types: ['COMPANY', 'ORGANIZATION'],
        cardinality: 'SINGLE',
        temporal_mode: 'STATIC',
        contradiction_mode: 'TEMPORAL_SINGLE_VALUE',
        is_active: true,
        version: 1,
        description: 'Product/Service belongs to organization'
      }
    ],

    // Facts (Entity -> Typed Literal Value)
    [
      'EMPLOYEE_COUNT',
      {
        predicate_code: 'EMPLOYEE_COUNT',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'INTEGER',
        cardinality: 'SINGLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'TEMPORAL_SINGLE_VALUE',
        is_active: true,
        version: 1,
        description: 'Reported number of employees'
      }
    ],
    [
      'INDUSTRY',
      {
        predicate_code: 'INDUSTRY',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'TEXT',
        cardinality: 'MULTIPLE',
        temporal_mode: 'STATIC',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Primary or secondary industry sector'
      }
    ],
    [
      'ANNUAL_REVENUE',
      {
        predicate_code: 'ANNUAL_REVENUE',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'MONEY',
        cardinality: 'SINGLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'TEMPORAL_SINGLE_VALUE',
        is_active: true,
        version: 1,
        description: 'Annual revenue figure'
      }
    ],
    [
      'TECH_STACK',
      {
        predicate_code: 'TECH_STACK',
        subject_entity_types: ['COMPANY', 'PRODUCT', 'SERVICE'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'TEXT',
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Technology or tool used'
      }
    ],
    [
      'HAS_ROLE',
      {
        predicate_code: 'HAS_ROLE',
        subject_entity_types: ['PERSON'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'TEXT',
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Job title or role held by person'
      }
    ],
    [
      'HIRING_FOR_ROLE',
      {
        predicate_code: 'HIRING_FOR_ROLE',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'TEXT',
        cardinality: 'MULTIPLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'NON_EXCLUSIVE',
        is_active: true,
        version: 1,
        description: 'Specific role or title being hired'
      }
    ],
    [
      'OPEN_POSITIONS_COUNT',
      {
        predicate_code: 'OPEN_POSITIONS_COUNT',
        subject_entity_types: ['COMPANY', 'ORGANIZATION'],
        object_kind: 'LITERAL_VALUE',
        object_value_type: 'INTEGER',
        cardinality: 'SINGLE',
        temporal_mode: 'TIME_VARYING',
        contradiction_mode: 'TEMPORAL_SINGLE_VALUE',
        is_active: true,
        version: 1,
        description: 'Total open job positions count'
      }
    ]
  ]);

  public static getPredicate(code: string): SemanticPredicateDefinition | undefined {
    return this.CORE_PREDICATES.get(code.toUpperCase());
  }

  public static getAllPredicates(): SemanticPredicateDefinition[] {
    return Array.from(this.CORE_PREDICATES.values());
  }

  /**
   * Validates fact assertion inputs against predicate registry rules.
   */
  public static validateFactInput(
    predicateCode: string,
    subjectType: CanonicalEntityType,
    valueType: LiteralValueType,
    objectValue: any
  ): { valid: boolean; error?: string } {
    const pred = this.getPredicate(predicateCode);
    if (!pred || !pred.is_active) {
      return { valid: false, error: `PREDICATE_UNKNOWN: Predicate '${predicateCode}' is not registered.` };
    }

    if (pred.object_kind !== 'LITERAL_VALUE') {
      return {
        valid: false,
        error: `PREDICATE_KIND_MISMATCH: Predicate '${predicateCode}' is an entity relationship, not a literal fact.`
      };
    }

    if (!pred.subject_entity_types.includes(subjectType)) {
      return {
        valid: false,
        error: `DOMAIN_VIOLATION: Predicate '${predicateCode}' does not permit subject entity type '${subjectType}'. Allowed: ${pred.subject_entity_types.join(', ')}`
      };
    }

    if (valueType !== pred.object_value_type) {
      return {
        valid: false,
        error: `VALUE_TYPE_MISMATCH: Predicate '${predicateCode}' expects value_type '${pred.object_value_type}', received '${valueType}'.`
      };
    }

    // Literal value type compatibility validation
    if (!this.isValidValueForType(objectValue, valueType)) {
      return {
        valid: false,
        error: `LITERAL_TYPE_INVALID: Value '${JSON.stringify(objectValue)}' is not valid for value_type '${valueType}'.`
      };
    }

    return { valid: true };
  }

  /**
   * Validates relationship assertion inputs against predicate registry rules.
   */
  public static validateRelationshipInput(
    predicateCode: string,
    subjectType: CanonicalEntityType,
    objectType: CanonicalEntityType
  ): { valid: boolean; error?: string } {
    const pred = this.getPredicate(predicateCode);
    if (!pred || !pred.is_active) {
      return { valid: false, error: `PREDICATE_UNKNOWN: Predicate '${predicateCode}' is not registered.` };
    }

    if (pred.object_kind !== 'CANONICAL_ENTITY') {
      return {
        valid: false,
        error: `PREDICATE_KIND_MISMATCH: Predicate '${predicateCode}' is a literal fact, not an entity relationship.`
      };
    }

    if (!pred.subject_entity_types.includes(subjectType)) {
      return {
        valid: false,
        error: `DOMAIN_VIOLATION: Predicate '${predicateCode}' does not permit subject entity type '${subjectType}'. Allowed: ${pred.subject_entity_types.join(', ')}`
      };
    }

    if (!pred.object_entity_types?.includes(objectType)) {
      return {
        valid: false,
        error: `RANGE_VIOLATION: Predicate '${predicateCode}' does not permit object entity type '${objectType}'. Allowed: ${pred.object_entity_types?.join(', ')}`
      };
    }

    return { valid: true };
  }

  public static isValidValueForType(val: any, type: LiteralValueType): boolean {
    if (val === null || val === undefined) return false;

    switch (type) {
      case 'TEXT':
        return typeof val === 'string' && val.trim().length > 0;
      case 'INTEGER':
        return typeof val === 'number' && Number.isInteger(val);
      case 'DECIMAL':
      case 'PERCENTAGE':
      case 'MONEY':
        return typeof val === 'number' && !isNaN(val);
      case 'BOOLEAN':
        return typeof val === 'boolean';
      case 'DATE':
      case 'TIMESTAMP':
        return typeof val === 'string' && !isNaN(Date.parse(val));
      case 'JSON_STRUCTURED':
        return typeof val === 'object';
      default:
        return false;
    }
  }
}
