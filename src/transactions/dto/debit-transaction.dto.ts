import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class DebitTransactionDto {
  @IsUUID(4, { message: 'instructionId must be a valid UUID v4' })
  @IsNotEmpty()
  instructionId: string;

  @IsString()
  @IsNotEmpty({ message: 'accountId must not be empty' })
  accountId: string;

  /**
   * Amount in kobo — must be a positive integer (no decimals).
   * @IsInt() rejects floats; @Min(1) rejects zero and negatives.
   */
  @IsInt({ message: 'amount must be an integer (kobo, no decimals)' })
  @Min(1, { message: 'amount must be greater than 0' })
  @Transform(({ value }) => Number(value))
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'NGN';

  @IsString()
  @IsNotEmpty({ message: 'narration must not be empty' })
  narration: string;

  @IsISO8601({}, { message: 'requestedAt must be a valid ISO 8601 date string' })
  @IsNotEmpty()
  requestedAt: string;
}
