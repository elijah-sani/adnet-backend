import { Body, Controller, Post } from '@nestjs/common';
import { DebitTransactionDto } from './dto/debit-transaction.dto';
import { DebitResponse, TransactionsService } from './transactions.service';

@Controller('api/v1/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * POST /api/v1/transactions/debit
   *
   * Submits a debit instruction. Idempotent — replaying the same
   * instructionId returns the original result without reprocessing.
   */
  @Post('debit')
  async debit(@Body() dto: DebitTransactionDto): Promise<DebitResponse> {
    return this.transactionsService.debit(dto);
  }
}
