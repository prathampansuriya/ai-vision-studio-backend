import { EventEmitter } from 'events';
import { Response } from 'express';
import { CreditTransactionType, CreditFeatureType } from '@prisma/client';
import { logger } from '../utils/logger.js';

export interface CreditBalanceEventPayload {
  userId: string;
  totalBalance: number;
  availableBalance: number;
  reservedCredits: number;
  change: number; // positive for grants/refunds, negative for usage
  type: CreditTransactionType;
  reason: string;
  referenceId?: string | null;
  timestamp: string;
}

export interface CreditReservationEventPayload {
  userId: string;
  reservationId: string;
  amount: number;
  status: 'PENDING' | 'SETTLED' | 'RELEASED' | 'EXPIRED';
  feature: CreditFeatureType;
  availableBalance: number;
  timestamp: string;
}

export interface CreditWarningEventPayload {
  userId: string;
  availableBalance: number;
  threshold: number;
  message: string;
  timestamp: string;
}

export type CreditEventType =
  | 'balance_updated'
  | 'reservation_created'
  | 'reservation_settled'
  | 'reservation_released'
  | 'low_balance'
  | 'exhausted';

class CreditEventBroadcaster extends EventEmitter {
  // Active SSE connections keyed by userId
  private sseClients: Map<string, Set<Response>> = new Map();

  constructor() {
    super();
    // Allow generous listeners for concurrent sessions
    this.setMaxListeners(200);
  }

  /**
   * Registers an active Server-Sent Events (SSE) client response
   */
  public registerSseClient(userId: string, res: Response): () => void {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }

    const userClients = this.sseClients.get(userId)!;
    userClients.add(res);

    logger.debug(`Registered SSE client for user ${userId}. Total active: ${userClients.size}`);

    // Return cleanup unsubscribe function
    return () => {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.sseClients.delete(userId);
      }
      logger.debug(`Removed SSE client for user ${userId}. Remaining: ${userClients.size}`);
    };
  }

  /**
   * Dispatches a typed event to both EventEmitter subscribers and active SSE HTTP streams
   */
  public broadcastToUser(userId: string, eventType: CreditEventType, payload: unknown): void {
    // 1. Emit on internal EventEmitter
    this.emit(`credit:${userId}`, { event: eventType, data: payload });
    this.emit('credit:all', { userId, event: eventType, data: payload });

    // 2. Stream to active SSE clients
    const clients = this.sseClients.get(userId);
    if (clients && clients.size > 0) {
      const sseMessage = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
      clients.forEach((res) => {
        try {
          res.write(sseMessage);
        } catch (err) {
          logger.warn(`Failed to push SSE message to client for user ${userId}:`, err);
        }
      });
    }
  }

  /**
   * Emits a balance updated event
   */
  public emitBalanceUpdated(payload: CreditBalanceEventPayload): void {
    this.broadcastToUser(payload.userId, 'balance_updated', payload);
  }

  /**
   * Emits reservation events
   */
  public emitReservationEvent(
    type: 'reservation_created' | 'reservation_settled' | 'reservation_released',
    payload: CreditReservationEventPayload
  ): void {
    this.broadcastToUser(payload.userId, type, payload);
  }

  /**
   * Emits low balance warning event
   */
  public emitLowBalance(payload: CreditWarningEventPayload): void {
    this.broadcastToUser(payload.userId, 'low_balance', payload);
  }

  /**
   * Emits exhausted credit balance alert
   */
  public emitExhausted(userId: string): void {
    this.broadcastToUser(userId, 'exhausted', {
      userId,
      availableBalance: 0,
      message: 'Your credit balance has been depleted. Please upgrade or top up to continue.',
      timestamp: new Date().toISOString(),
    });
  }
}

export const creditEvents = new CreditEventBroadcaster();
