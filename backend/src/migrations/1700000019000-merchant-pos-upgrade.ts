import { MigrationInterface, QueryRunner } from 'typeorm';

export class MerchantPosUpgrade1700000019000 implements MigrationInterface {
  name = 'MerchantPosUpgrade1700000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_business_type_enum') THEN
          CREATE TYPE "merchant_business_type_enum" AS ENUM ('SOLE_PROPRIETORSHIP', 'LLC', 'PLC');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_status_enum') THEN
          CREATE TYPE "merchant_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_terminal_status_enum') THEN
          CREATE TYPE "pos_terminal_status_enum" AS ENUM ('ACTIVE', 'PENDING', 'INACTIVE', 'SUSPENDED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_cycle_enum') THEN
          CREATE TYPE "settlement_cycle_enum" AS ENUM ('T0', 'T1');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status_enum') THEN
          CREATE TYPE "settlement_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_transaction_currency_enum') THEN
          CREATE TYPE "merchant_transaction_currency_enum" AS ENUM ('NGN', 'USD');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_transaction_status_enum') THEN
          CREATE TYPE "merchant_transaction_status_enum" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_transaction_channel_enum') THEN
          CREATE TYPE "merchant_transaction_channel_enum" AS ENUM ('CARD', 'TRANSFER', 'QR');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_transaction_type_enum') THEN
          CREATE TYPE "merchant_transaction_type_enum" AS ENUM ('CARD_PAYMENT', 'TRANSFER_PAYMENT', 'QR_PAYMENT');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merchants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "owner_user_id" uuid NOT NULL,
        "merchant_code" character varying(64) NOT NULL,
        "business_name" character varying(200) NOT NULL,
        "business_type" "merchant_business_type_enum" NOT NULL,
        "tin" character varying(20),
        "rc_number" character varying(20),
        "category_code" character varying(10) NOT NULL,
        "wallet_id" uuid,
        "settlement_account" character varying(20),
        "settlement_bank" character varying(10),
        "address" jsonb NOT NULL,
        "geo_location" jsonb NOT NULL,
        "geo_fence_radius" integer NOT NULL DEFAULT 10,
        "status" "merchant_status_enum" NOT NULL DEFAULT 'PENDING',
        "approved_at" TIMESTAMPTZ,
        "approved_by" uuid,
        CONSTRAINT "PK_merchants_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchants_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_merchants_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_merchants_owner_user_id" ON "merchants" ("owner_user_id")`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_merchants_merchant_code" ON "merchants" ("merchant_code")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_terminals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "terminal_id" character varying(8) NOT NULL,
        "merchant_id" uuid NOT NULL,
        "serial_number" character varying(50) NOT NULL,
        "model" character varying(50),
        "ptsa_id" character varying(20) NOT NULL,
        "geo_location" jsonb NOT NULL,
        "geo_fence_radius" integer NOT NULL DEFAULT 10,
        "is_online" boolean NOT NULL DEFAULT true,
        "last_heartbeat" TIMESTAMPTZ,
        "status" "pos_terminal_status_enum" NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_pos_terminals_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pos_terminals_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pos_terminals_terminal_id" ON "pos_terminals" ("terminal_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pos_terminals_merchant_status" ON "pos_terminals" ("merchant_id", "status")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "merchant_id" uuid NOT NULL,
        "cycle" "settlement_cycle_enum" NOT NULL DEFAULT 'T1',
        "settlement_date" date NOT NULL,
        "total_amount" bigint NOT NULL,
        "total_fee" bigint NOT NULL,
        "net_amount" bigint NOT NULL,
        "transaction_count" integer NOT NULL,
        "status" "settlement_status_enum" NOT NULL DEFAULT 'PENDING',
        "reference" character varying(100) NOT NULL,
        "settled_at" TIMESTAMPTZ,
        CONSTRAINT "PK_settlements_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_settlements_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_settlements_reference" ON "settlements" ("reference")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_settlements_merchant_date" ON "settlements" ("merchant_id", "settlement_date")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_settlements_merchant_status" ON "settlements" ("merchant_id", "status")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merchant_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "merchant_id" uuid NOT NULL,
        "reference" character varying(100) NOT NULL,
        "amount_minor" bigint NOT NULL,
        "fee_minor" bigint NOT NULL DEFAULT 0,
        "net_amount_minor" bigint NOT NULL,
        "currency" "merchant_transaction_currency_enum" NOT NULL DEFAULT 'NGN',
        "status" "merchant_transaction_status_enum" NOT NULL DEFAULT 'SUCCESS',
        "channel" "merchant_transaction_channel_enum" NOT NULL DEFAULT 'TRANSFER',
        "type" "merchant_transaction_type_enum" NOT NULL DEFAULT 'TRANSFER_PAYMENT',
        "customer_masked_pan" character varying(32),
        "metadata" jsonb,
        "posted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_transactions_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_merchant_transactions_reference" ON "merchant_transactions" ("reference")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merchant_transactions_merchant_posted_at" ON "merchant_transactions" ("merchant_id", "posted_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merchant_transactions_merchant_status" ON "merchant_transactions" ("merchant_id", "status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_merchant_transactions_merchant_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_merchant_transactions_merchant_posted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_merchant_transactions_reference"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_transactions"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settlements_merchant_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settlements_merchant_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_settlements_reference"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_terminals_merchant_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_pos_terminals_terminal_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_terminals"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_merchants_merchant_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_merchants_owner_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchants"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "merchant_transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "merchant_transaction_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "merchant_transaction_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "merchant_transaction_currency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_cycle_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pos_terminal_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "merchant_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "merchant_business_type_enum"`);
  }
}

