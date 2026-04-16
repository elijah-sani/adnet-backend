import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/entities/transaction.entity';

export interface ReconciliationStatus {
  lastRunAt: Date | null;
  lastResolvedCount: number;
  currentPendingCount: number;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  // In-memory state — intentionally not persisted to the database.
  private lastRunAt: Date | null = null;
  private lastResolvedCount = 0;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runReconciliation(): Promise<void> {
    this.logger.log('Reconciliation job started');

    try {
      // Any pending transaction older than 2 minutes is considered timed out.
      const cutoff = new Date(Date.now() - 2 * 60 * 1000);

      const stale = await this.transactionRepo.find({
        where: {
          status: TransactionStatus.PENDING,
          createdAt: LessThan(cutoff),
        },
      });

      for (const tx of stale) {
        tx.status = TransactionStatus.FAILED;
        tx.failureReason = 'reconciliation_timeout';
        await this.transactionRepo.save(tx);

        this.logger.log(
          `Resolved stale transaction id=${tx.id} createdAt=${tx.createdAt.toISOString()}`,
        );
      }

      this.lastRunAt = new Date();
      this.lastResolvedCount = stale.length;

      this.logger.log(
        `Reconciliation job finished — resolved ${stale.length} transaction(s)`,
      );
    } catch (err) {
      this.logger.error(
        'Reconciliation job failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async getStatus(): Promise<ReconciliationStatus> {
    const currentPendingCount = await this.transactionRepo.count({
      where: { status: TransactionStatus.PENDING },
    });

    return {
      lastRunAt: this.lastRunAt,
      lastResolvedCount: this.lastResolvedCount,
      currentPendingCount,
    };
  }
}
