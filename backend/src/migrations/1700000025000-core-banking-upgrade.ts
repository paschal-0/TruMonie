import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreBankingUpgrade1700000025000 implements MigrationInterface {
  name = 'CoreBankingUpgrade1700000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gl_account_type_enum') THEN
          CREATE TYPE "gl_account_type_enum" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gl_normal_balance_enum') THEN
          CREATE TYPE "gl_normal_balance_enum" AS ENUM ('DEBIT', 'CREDIT');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gl_entry_type_enum') THEN
          CREATE TYPE "gl_entry_type_enum" AS ENUM ('DEBIT', 'CREDIT');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profit_pool_type_enum') THEN
          CREATE TYPE "profit_pool_type_enum" AS ENUM ('MUDARABAH', 'MUSHARAKAH');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profit_pool_status_enum') THEN
          CREATE TYPE "profit_pool_status_enum" AS ENUM ('ACTIVE', 'CLOSED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gl_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "account_code" character varying(10) NOT NULL,
        "account_name" character varying(200) NOT NULL,
        "parent_code" character varying(10),
        "account_type" "gl_account_type_enum" NOT NULL,
        "normal_balance" "gl_normal_balance_enum" NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'NGN',
        "balance_minor" bigint NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_gl_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gl_accounts_account_code" UNIQUE ("account_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gl_postings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "gl_account_code" character varying(10) NOT NULL,
        "entry_type" "gl_entry_type_enum" NOT NULL,
        "amount_minor" bigint NOT NULL,
        "narration" text NOT NULL,
        "value_date" date NOT NULL,
        "posted_by" character varying(50) NOT NULL,
        CONSTRAINT "PK_gl_postings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gl_postings_transaction_id"
      ON "gl_postings" ("transaction_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gl_postings_gl_account_code_value_date"
      ON "gl_postings" ("gl_account_code", "value_date")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profit_sharing_pools" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "pool_name" character varying(100) NOT NULL,
        "pool_type" "profit_pool_type_enum" NOT NULL,
        "total_capital_minor" bigint NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "psr_investor" numeric(8,6) NOT NULL,
        "psr_manager" numeric(8,6) NOT NULL,
        "per_rate" numeric(8,6) NOT NULL DEFAULT 0.020000,
        "status" "profit_pool_status_enum" NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_profit_sharing_pools_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profit_sharing_pools_type_status"
      ON "profit_sharing_pools" ("pool_type", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profit_distributions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "pool_id" uuid NOT NULL,
        "period" date NOT NULL,
        "gross_earnings_minor" bigint NOT NULL,
        "expenses_minor" bigint NOT NULL,
        "per_allocation_minor" bigint NOT NULL,
        "distributable_minor" bigint NOT NULL,
        "investor_share_minor" bigint NOT NULL,
        "manager_share_minor" bigint NOT NULL,
        "distributed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_profit_distributions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profit_distributions_pool" FOREIGN KEY ("pool_id")
          REFERENCES "profit_sharing_pools"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profit_distributions_pool_period"
      ON "profit_distributions" ("pool_id", "period")
    `);

    await queryRunner.query(`
      ALTER TABLE "journal_lines"
      ADD COLUMN IF NOT EXISTS "value_date" date NOT NULL DEFAULT CURRENT_DATE
    `);
    await queryRunner.query(`
      ALTER TABLE "journal_lines"
      ADD COLUMN IF NOT EXISTS "posted_by" character varying(50) NOT NULL DEFAULT 'core-banking-engine'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "journal_lines" DROP COLUMN IF EXISTS "posted_by"`);
    await queryRunner.query(`ALTER TABLE "journal_lines" DROP COLUMN IF EXISTS "value_date"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_profit_distributions_pool_period"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profit_distributions"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_profit_sharing_pools_type_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profit_sharing_pools"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gl_postings_gl_account_code_value_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gl_postings_transaction_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gl_postings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gl_accounts"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "profit_pool_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "profit_pool_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gl_entry_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gl_normal_balance_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gl_account_type_enum"`);
  }
}

