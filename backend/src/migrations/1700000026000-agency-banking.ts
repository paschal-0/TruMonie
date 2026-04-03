import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyBanking1700000026000 implements MigrationInterface {
  name = 'AgencyBanking1700000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type_enum')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_enum
            WHERE enumtypid = 'account_type_enum'::regtype
              AND enumlabel = 'AGENT'
          )
        THEN
          ALTER TYPE "account_type_enum" ADD VALUE 'AGENT';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_type_enum') THEN
          CREATE TYPE "agent_type_enum" AS ENUM ('INDIVIDUAL', 'CORPORATE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_status_enum') THEN
          CREATE TYPE "agent_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_tier_enum') THEN
          CREATE TYPE "agent_tier_enum" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "owner_user_id" uuid NOT NULL,
        "agent_code" character varying(20) NOT NULL,
        "business_name" character varying(200) NOT NULL,
        "business_address" jsonb NOT NULL,
        "geo_location" jsonb NOT NULL,
        "agent_type" "agent_type_enum" NOT NULL,
        "principal_id" uuid NOT NULL,
        "super_agent_id" uuid NOT NULL,
        "wallet_id" uuid NOT NULL,
        "status" "agent_status_enum" NOT NULL DEFAULT 'PENDING',
        "tier" "agent_tier_enum" NOT NULL DEFAULT 'BASIC',
        "certified_at" TIMESTAMPTZ,
        "suspended_at" TIMESTAMPTZ,
        "suspended_reason" text,
        CONSTRAINT "PK_agents_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agents_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_agents_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_agents_agent_code" UNIQUE ("agent_code"),
        CONSTRAINT "UQ_agents_wallet_id" UNIQUE ("wallet_id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agents_owner_user_id" ON "agents" ("owner_user_id")`
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_exclusivity_status_enum') THEN
          CREATE TYPE "agent_exclusivity_status_enum" AS ENUM ('ACTIVE', 'INACTIVE');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_exclusivity" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "agent_id" uuid NOT NULL,
        "principal_id" uuid NOT NULL,
        "super_agent_id" uuid NOT NULL,
        "effective_date" date NOT NULL DEFAULT '2026-04-01',
        "status" "agent_exclusivity_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "verified_at" TIMESTAMPTZ,
        "verified_by" uuid,
        CONSTRAINT "PK_agent_exclusivity_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_exclusivity_agent" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_exclusivity_agent_id" ON "agent_exclusivity" ("agent_id")`
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_agent_exclusivity_agent_active"
      ON "agent_exclusivity" ("agent_id")
      WHERE "status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_wallet_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "wallet_id" uuid NOT NULL,
        "agent_id" uuid NOT NULL,
        "float_limit" bigint NOT NULL,
        "low_balance_threshold" bigint NOT NULL,
        "auto_fund_enabled" boolean NOT NULL DEFAULT false,
        "auto_fund_source" uuid,
        "auto_fund_amount" bigint,
        CONSTRAINT "PK_agent_wallet_config_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_wallet_config_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_agent_wallet_config_agent" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_agent_wallet_config_wallet" UNIQUE ("wallet_id"),
        CONSTRAINT "UQ_agent_wallet_config_agent" UNIQUE ("agent_id")
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_limit_type_enum') THEN
          CREATE TYPE "agent_limit_type_enum" AS ENUM ('CASH_IN', 'CASH_OUT', 'TOTAL', 'CUMULATIVE_CASH_OUT', 'SINGLE_TXN');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_limit_period_enum') THEN
          CREATE TYPE "agent_limit_period_enum" AS ENUM ('DAILY', 'WEEKLY', 'TRANSACTION');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_limit_applies_to_enum') THEN
          CREATE TYPE "agent_limit_applies_to_enum" AS ENUM ('CUSTOMER', 'AGENT');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_limits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "limit_type" "agent_limit_type_enum" NOT NULL,
        "period" "agent_limit_period_enum" NOT NULL,
        "max_amount" bigint NOT NULL,
        "applies_to" "agent_limit_applies_to_enum" NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        CONSTRAINT "PK_agent_limits_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_limits_type_applies_to" ON "agent_limits" ("limit_type", "applies_to", "effective_from")`
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_transaction_type_enum') THEN
          CREATE TYPE "agent_transaction_type_enum" AS ENUM ('CASH_IN', 'CASH_OUT', 'BILL_PAYMENT', 'ACCOUNT_OPENING');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_transaction_status_enum') THEN
          CREATE TYPE "agent_transaction_status_enum" AS ENUM ('SUCCESS', 'FAILED', 'REVERSED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_transaction_currency_enum') THEN
          CREATE TYPE "agent_transaction_currency_enum" AS ENUM ('NGN', 'USD');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "agent_id" uuid NOT NULL,
        "reference" character varying(100) NOT NULL,
        "idempotency_key" uuid NOT NULL,
        "customer_user_id" uuid,
        "customer_wallet_id" uuid,
        "type" "agent_transaction_type_enum" NOT NULL,
        "status" "agent_transaction_status_enum" NOT NULL,
        "amount_minor" bigint NOT NULL,
        "commission_minor" bigint NOT NULL DEFAULT 0,
        "currency" "agent_transaction_currency_enum" NOT NULL DEFAULT 'NGN',
        "metadata" jsonb,
        "posted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_agent_transactions_reference" UNIQUE ("reference"),
        CONSTRAINT "UQ_agent_transactions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_agent_transactions_agent" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_agent_transactions_customer_user" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_agent_transactions_customer_wallet" FOREIGN KEY ("customer_wallet_id") REFERENCES "accounts"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_transactions_agent_posted_at" ON "agent_transactions" ("agent_id", "posted_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_transactions_customer_posted_at" ON "agent_transactions" ("customer_user_id", "posted_at")`
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_commission_status_enum') THEN
          CREATE TYPE "agent_commission_status_enum" AS ENUM ('PENDING', 'SETTLED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_commission_transaction_type_enum') THEN
          CREATE TYPE "agent_commission_transaction_type_enum" AS ENUM ('CASH_IN', 'CASH_OUT', 'BILL_PAYMENT', 'ACCOUNT_OPENING');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_commissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "agent_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "transaction_type" "agent_commission_transaction_type_enum" NOT NULL,
        "transaction_amount" bigint NOT NULL,
        "commission_amount" bigint NOT NULL,
        "rate" numeric(5,4) NOT NULL,
        "status" "agent_commission_status_enum" NOT NULL DEFAULT 'PENDING',
        "settled_at" TIMESTAMPTZ,
        CONSTRAINT "PK_agent_commissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_commissions_agent" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_agent_commissions_transaction" FOREIGN KEY ("transaction_id") REFERENCES "agent_transactions"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_commissions_agent_created_at" ON "agent_commissions" ("agent_id", "created_at")`
    );

    await queryRunner.query(`
      INSERT INTO "agent_limits" ("limit_type", "period", "max_amount", "applies_to", "effective_from")
      VALUES
        ('CASH_IN', 'DAILY', 10000000, 'CUSTOMER', '2025-01-01'),
        ('CASH_OUT', 'DAILY', 10000000, 'CUSTOMER', '2025-01-01'),
        ('TOTAL', 'WEEKLY', 50000000, 'CUSTOMER', '2025-01-01'),
        ('CUMULATIVE_CASH_OUT', 'DAILY', 120000000, 'AGENT', '2025-01-01'),
        ('SINGLE_TXN', 'TRANSACTION', 10000000, 'CUSTOMER', '2025-01-01')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_commissions_agent_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_commissions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_commission_transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_commission_status_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_transactions_customer_posted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_transactions_agent_posted_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_transaction_currency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_transaction_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_transaction_type_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_limits_type_applies_to"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_limits"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_limit_applies_to_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_limit_period_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_limit_type_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "agent_wallet_config"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_agent_exclusivity_agent_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_exclusivity_agent_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_exclusivity"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_exclusivity_status_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agents_owner_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agents"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_tier_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_type_enum"`);
  }
}

