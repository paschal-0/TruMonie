import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletManagementUpgrade1700000016000 implements MigrationInterface {
  name = 'WalletManagementUpgrade1700000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "available_balance_minor" bigint NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "ledger_balance_minor" bigint NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "tier" integer NOT NULL DEFAULT 1`
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "daily_limit_minor" bigint NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "max_balance_minor" bigint`
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "frozen_reason" text`
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "frozen_at" TIMESTAMPTZ`
    );
    await queryRunner.query(`
      UPDATE "accounts"
      SET
        "available_balance_minor" = COALESCE("available_balance_minor", "balance_minor"),
        "ledger_balance_minor" = COALESCE("ledger_balance_minor", "balance_minor")
      WHERE true
    `);
    await queryRunner.query(`
      UPDATE "accounts" a
      SET
        "tier" = CASE u."limit_tier"
          WHEN 'TIER0' THEN 0
          WHEN 'TIER1' THEN 1
          WHEN 'TIER2' THEN 2
          WHEN 'TIER3' THEN 3
          ELSE 0
        END,
        "daily_limit_minor" = CASE u."limit_tier"
          WHEN 'TIER0' THEN 1000000
          WHEN 'TIER1' THEN 3000000
          WHEN 'TIER2' THEN 10000000
          WHEN 'TIER3' THEN 2500000000
          ELSE 1000000
        END,
        "max_balance_minor" = CASE u."limit_tier"
          WHEN 'TIER0' THEN 10000000
          WHEN 'TIER1' THEN 30000000
          WHEN 'TIER2' THEN 50000000
          WHEN 'TIER3' THEN NULL
          ELSE 10000000
        END
      FROM "users" u
      WHERE a."user_id" = u."id" AND a."type" = 'WALLET_MAIN'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "virtual_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "wallet_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "account_number" character varying(20) NOT NULL,
        "account_name" character varying(200) NOT NULL,
        "bank_name" character varying(100) NOT NULL,
        "bank_code" character varying(10) NOT NULL,
        "currency" character varying(3) NOT NULL,
        "provider" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_virtual_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_virtual_accounts_account_number" UNIQUE ("account_number"),
        CONSTRAINT "FK_virtual_accounts_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_virtual_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_virtual_accounts_wallet_currency_provider_status" ON "virtual_accounts" ("wallet_id", "currency", "provider", "status")`
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_transaction_type_enum') THEN
          CREATE TYPE "wallet_transaction_type_enum" AS ENUM ('CREDIT', 'DEBIT');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_transaction_status_enum') THEN
          CREATE TYPE "wallet_transaction_status_enum" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "reference" character varying(100) NOT NULL,
        "wallet_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "wallet_transaction_type_enum" NOT NULL,
        "category" character varying(30) NOT NULL,
        "amount_minor" bigint NOT NULL,
        "fee_minor" bigint NOT NULL DEFAULT 0,
        "status" "wallet_transaction_status_enum" NOT NULL,
        "description" text NOT NULL,
        "counterparty" jsonb,
        "balance_before_minor" bigint NOT NULL,
        "balance_after_minor" bigint NOT NULL,
        "channel" character varying(20),
        "session_id" character varying(100),
        "metadata" jsonb,
        "posted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallet_transactions_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_wallet_transactions_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wallet_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_wallet_posted_at" ON "wallet_transactions" ("wallet_id", "posted_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_wallet_type_status_category" ON "wallet_transactions" ("wallet_id", "type", "status", "category")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "wallet_id" uuid,
        "event_type" character varying(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "published_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_events_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wallet_events_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_events_event_type_published_at" ON "wallet_events" ("event_type", "published_at")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_events_event_type_published_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_transactions_wallet_type_status_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_transactions_wallet_posted_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wallet_transaction_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wallet_transaction_type_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_virtual_accounts_wallet_currency_provider_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "virtual_accounts"`);

    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "frozen_at"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "frozen_reason"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "max_balance_minor"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "daily_limit_minor"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "tier"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "ledger_balance_minor"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "available_balance_minor"`);
  }
}
