import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true, nullable: false })
  instructionId: string;

  @Column({ type: 'varchar', nullable: false })
  accountId: string;

  /** Amount in kobo (integer only — no decimals) */
  @Column({ type: 'integer', nullable: false })
  amount: number;

  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', nullable: false })
  narration: string;

  @Column({ type: 'timestamptz', nullable: false })
  requestedAt: Date;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true, nullable: true })
  transactionRef: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  /** Balance after transaction, in kobo */
  @Column({ type: 'integer', nullable: true })
  balanceAfter: number | null;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
