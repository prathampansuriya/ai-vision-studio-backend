import { SortOrder } from '../../shared/types/index.js';

export function sanitizeSearchQuery(query?: unknown): string | undefined {
  if (typeof query !== 'string') return undefined;
  // Trim and strip dangerous control characters and wildcards
  const cleaned = query.trim().replace(/[\x00-\x1F\x7F]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 100) : undefined;
}

export function parseDateRange(
  from?: unknown,
  to?: unknown
): { gte?: Date; lte?: Date } | undefined {
  let gte: Date | undefined;
  let lte: Date | undefined;

  if (typeof from === 'string' && !isNaN(Date.parse(from))) {
    gte = new Date(from);
  }

  if (typeof to === 'string' && !isNaN(Date.parse(to))) {
    lte = new Date(to);
  }

  if (!gte && !lte) return undefined;
  return { gte, lte };
}

export function parseSortOrder(order?: unknown, defaultOrder: SortOrder = 'desc'): SortOrder {
  if (typeof order === 'string' && (order.toLowerCase() === 'asc' || order.toLowerCase() === 'desc')) {
    return order.toLowerCase() as SortOrder;
  }
  return defaultOrder;
}
