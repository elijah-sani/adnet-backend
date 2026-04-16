import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DebitTransactionDto } from './dto/debit-transaction.dto';
import {
  Transaction,
  TransactionStatus,
} from './entities/transaction.entity';

export interface DebitResponse {
  status: 'success';
  instructionId: string;
  transactionRef: string;
  processedAt: Date;
  balanceAfter: number;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  async debit(dto: DebitTransactionDto): Promise<DebitResponse> {
    // ── Step 1: Idempotency check ─────────────────────────────────────────
    const existing = await this.transactionRepo.findOne({
      where: { instructionId: dto.instructionId },
    });

    if (existing) {
      // Return the original outcome without reprocessing.
      return {
        status: 'success',
        instructionId: existing.instructionId,
        transactionRef: existing.transactionRef as string,
        processedAt: existing.processedAt as Date,
        balanceAfter: existing.balanceAfter as number,
      };
    }

    // ── Step 2: Persist BEFORE processing ────────────────────────────────
    const transaction = this.transactionRepo.create({
      instructionId: dto.instructionId,
      accountId: dto.accountId,
      amount: dto.amount,
      currency: dto.currency ?? 'NGN',
      narration: dto.narration,
      requestedAt: new Date(dto.requestedAt),
      status: TransactionStatus.PENDING,
      transactionRef: `TXN-${uuidv4()}`,
    });

    try {
      await this.transactionRepo.save(transaction);
    } catch (insertError) {
      // PostgreSQL unique constraint violation — a concurrent request
      // already inserted a row with this instructionId between our
      // Step 1 check and this insert. Treat it as idempotent.
      if (
        typeof insertError === 'object' &&
        insertError !== null &&
        (insertError as { code?: string }).code === '23505'
      ) {
        const race = await this.transactionRepo.findOne({
          where: { instructionId: dto.instructionId },
        });

        return {
          status: 'success',
          instructionId: race!.instructionId,
          transactionRef: race!.transactionRef as string,
          processedAt: race!.processedAt as Date,
          balanceAfter: race!.balanceAfter as number,
        };
      }

      // Any other DB error — re-throw so NestJS returns a 500.
      throw insertError;
    }

    // ── Step 3: Process the debit (with failure handling) ─────────────────
    try {
      transaction.status = TransactionStatus.SUCCESS;
      transaction.processedAt = new Date();
      transaction.balanceAfter = 0; // simulated balance

      await this.transactionRepo.save(transaction);
    } catch (processingError) {
      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason =
        processingError instanceof Error
          ? processingError.message
          : 'Unknown processing error';

      await this.transactionRepo.save(transaction);

      throw new HttpException(
        {
          errorCode: 'PROCESSING_FAILED',
          message: 'Transaction could not be processed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // ── Step 4: Return structured success response ─────────────────────────
    return {
      status: 'success',
      instructionId: transaction.instructionId,
      transactionRef: transaction.transactionRef as string,
      processedAt: transaction.processedAt,
      balanceAfter: transaction.balanceAfter,
    };
  }
}
