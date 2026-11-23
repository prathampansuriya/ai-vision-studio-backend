import { z } from 'zod';

export const SNAPSHOT_SOURCES = ['CAMERA', 'SCREEN', 'COMPOSITE'] as const;
export const ANALYSIS_STATUSES = ['PENDING', 'ANALYZING', 'COMPLETED', 'FAILED'] as const;

export const captureSnapshotSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
  imageData: z.string().min(100, 'Snapshot image frame data is required'),
  source: z.enum(SNAPSHOT_SOURCES).default('CAMERA'),
  description: z.string().trim().max(300, 'Description must be under 300 characters').optional().nullable(),
  userNotes: z.string().trim().max(2000, 'User notes must be under 2000 characters').optional().nullable(),
  annotations: z.any().optional().nullable(),
  annotatedImageData: z.string().optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  autoAnalyze: z.boolean().default(false),
});

export type CaptureSnapshotInput = z.infer<typeof captureSnapshotSchema>;

export const updateSnapshotSchema = z.object({
  description: z.string().trim().max(300).optional().nullable(),
  userNotes: z.string().trim().max(2000).optional().nullable(),
  annotations: z.any().optional().nullable(),
  annotatedImageData: z.string().optional().nullable(),
});

export type UpdateSnapshotInput = z.infer<typeof updateSnapshotSchema>;

export const analyzeSnapshotSchema = z.object({
  prompt: z.string().trim().max(1000).optional().nullable(),
  focusArea: z.string().trim().max(100).optional().nullable(),
});

export type AnalyzeSnapshotInput = z.infer<typeof analyzeSnapshotSchema>;

export const askSnapshotSchema = z.object({
  question: z.string().trim().min(2, 'Question must be at least 2 characters').max(1000, 'Question must be under 1000 characters'),
});

export type AskSnapshotInput = z.infer<typeof askSnapshotSchema>;

export const compareSnapshotsSchema = z.object({
  snapshotAId: z.string().uuid('Snapshot A ID must be a valid UUID'),
  snapshotBId: z.string().uuid('Snapshot B ID must be a valid UUID'),
  prompt: z.string().trim().max(1000).optional().nullable(),
});

export type CompareSnapshotsInput = z.infer<typeof compareSnapshotsSchema>;

export const listSnapshotsQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  source: z.enum(SNAPSHOT_SOURCES).optional(),
  analysisStatus: z.enum(ANALYSIS_STATUSES).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['captureTimestamp', 'createdAt', 'sizeBytes']).default('captureTimestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type ListSnapshotsQuery = z.infer<typeof listSnapshotsQuerySchema>;
