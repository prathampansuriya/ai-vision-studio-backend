/**
 * Backend Shared Contract Types
 * AI Vision Studio
 */

export interface ApiResponseMeta {
  timestamp: string;
  requestId?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: ApiResponseMeta;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export type UserRole = 'USER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION' | 'DEACTIVATED';

export interface AuthUserContext {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  creditBalance: number;
}

export interface ServiceHealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  latencyMs?: number;
  message?: string;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: ServiceHealthStatus;
    aiService?: ServiceHealthStatus;
  };
  system: {
    nodeVersion: string;
    platform: string;
    memoryUsageMb: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
    };
  };
}

export type SortOrder = 'asc' | 'desc';

export interface DateRangeFilter {
  from?: string;
  to?: string;
}
