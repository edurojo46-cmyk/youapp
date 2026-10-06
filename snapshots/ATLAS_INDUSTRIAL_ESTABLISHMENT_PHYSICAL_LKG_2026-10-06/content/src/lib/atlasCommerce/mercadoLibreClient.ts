/**
 * Atlas Commerce V1 — Mercado Libre Modern API Client Contracts
 * Gate Zero: Uses modern bulk endpoints (/items/bulk?ids= and /users/bulk?ids=)
 * deprecating legacy endpoints ahead of Oct 2026 deadline.
 */

import { RawMercadoLibreItem, RawMercadoLibreSeller } from './types';

export interface MercadoLibreBulkItemResponse {
  code: number;
  body: RawMercadoLibreItem | null;
}

export interface MercadoLibreBulkUserResponse {
  code: number;
  body: RawMercadoLibreSeller | null;
}

export class MercadoLibreClient {
  public static readonly BASE_API_URL = 'https://api.mercadolibre.com';

  /**
   * Builds the modern bulk items query URL.
   * Endpoint: GET /items/bulk?ids=MLA123,MLA456
   */
  static buildBulkItemsUrl(itemIds: string[]): string {
    if (!itemIds || itemIds.length === 0) {
      throw new Error('INVALID_ARGUMENT: itemIds array cannot be empty');
    }
    const cleanIds = itemIds.map((id) => id.trim()).filter(Boolean);
    return `${MercadoLibreClient.BASE_API_URL}/items/bulk?ids=${cleanIds.join(',')}`;
  }

  /**
   * Builds the modern bulk users/sellers query URL.
   * Endpoint: GET /users/bulk?ids=123456,789012
   */
  static buildBulkUsersUrl(userIds: (string | number)[]): string {
    if (!userIds || userIds.length === 0) {
      throw new Error('INVALID_ARGUMENT: userIds array cannot be empty');
    }
    const cleanIds = userIds.map((id) => String(id).trim()).filter(Boolean);
    return `${MercadoLibreClient.BASE_API_URL}/users/bulk?ids=${cleanIds.join(',')}`;
  }

  /**
   * Parses the modern bulk items response.
   * Handles individual item 404s/errors without poisoning the entire batch.
   */
  static parseBulkItemsResponse(
    responseList: MercadoLibreBulkItemResponse[]
  ): { activeItems: RawMercadoLibreItem[]; missingOrInactiveIds: string[] } {
    const activeItems: RawMercadoLibreItem[] = [];
    const missingOrInactiveIds: string[] = [];

    for (const itemResp of responseList) {
      if (itemResp.code === 200 && itemResp.body) {
        activeItems.push(itemResp.body);
      } else if (itemResp.body?.id) {
        missingOrInactiveIds.push(itemResp.body.id);
      }
    }

    return { activeItems, missingOrInactiveIds };
  }

  /**
   * Parses the modern bulk sellers response.
   */
  static parseBulkUsersResponse(
    responseList: MercadoLibreBulkUserResponse[]
  ): { validSellers: RawMercadoLibreSeller[]; invalidUserIds: string[] } {
    const validSellers: RawMercadoLibreSeller[] = [];
    const invalidUserIds: string[] = [];

    for (const userResp of responseList) {
      if (userResp.code === 200 && userResp.body) {
        validSellers.push(userResp.body);
      } else if (userResp.body?.id) {
        invalidUserIds.push(String(userResp.body.id));
      }
    }

    return { validSellers, invalidUserIds };
  }
}
