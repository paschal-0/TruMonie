import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransfersV21700000017000 implements MigrationInterface {
  name = 'TransfersV21700000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfers_destination_type_enum') THEN
          CREATE TYPE "transfers_destination_type_enum" AS ENUM ('INTERNAL', 'NIP');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfers_status_enum') THEN
          CREATE TYPE "transfers_status_enum" AS ENUM ('PROCESSING', 'PENDING', 'SUCCESS', 'FAILED', 'MANUAL_REVIEW');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfers_currency_enum') THEN
          CREATE TYPE "transfers_currency_enum" AS ENUM ('NGN', 'USD');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transfers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "reference" character varying(100) NOT NULL,
        "idempotency_key" uuid NOT NULL,
        "receipt_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" character varying(50),
        "source_wallet_id" uuid NOT NULL,
        "source_user_id" uuid NOT NULL,
        "destination_type" "transfers_destination_type_enum" NOT NULL,
        "destination_account" character varying(20) NOT NULL,
        "destination_bank" character varying(10),
        "destination_name" character varying(200) NOT NULL,
        "amount_minor" bigint NOT NULL,
        "fee_minor" bigint NOT NULL DEFAULT 0,
        "currency" "transfers_currency_enum" NOT NULL DEFAULT 'NGN',
        "narration" text,
        "status" "transfers_status_enum" NOT NULL DEFAULT 'PENDING',
        "nip_response_code" character varying(5),
        "nip_response_message" text,
        "tsq_attempts" integer NOT NULL DEFAULT 0,
        "completed_at" TIMESTAMPTZ,
        "reversed_at" TIMESTAMPTZ,
        "provider" character varying(64),
        "provider_reference" character varying(128),
        "metadata" jsonb,
        CONSTRAINT "PK_transfers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transfers_reference" UNIQUE ("reference"),
        CONSTRAINT "UQ_transfers_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "UQ_transfers_receipt_id" UNIQUE ("receipt_id"),
        CONSTRAINT "FK_transfers_source_wallet" FOREIGN KEY ("source_wallet_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transfers_source_user" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transfers_source_user_status_created_at" ON "transfers" ("source_user_id", "status", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transfers_source_wallet_created_at" ON "transfers" ("source_wallet_id", "created_at")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transfer_beneficiaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "account_number" character varying(20) NOT NULL,
        "bank_code" character varying(10) NOT NULL,
        "bank_name" character varying(100),
        "account_name" character varying(200) NOT NULL,
        "alias" character varying(80),
        "last_used_at" TIMESTAMPTZ,
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_transfer_beneficiaries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transfer_beneficiaries_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transfer_beneficiaries_user_deleted_at" ON "transfer_beneficiaries" ("user_id", "deleted_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transfer_beneficiaries_user_bank_account" ON "transfer_beneficiaries" ("user_id", "bank_code", "account_number")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transfer_beneficiaries_user_bank_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transfer_beneficiaries_user_deleted_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transfer_beneficiaries"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transfers_source_wallet_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transfers_source_user_status_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transfers"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "transfers_currency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transfers_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transfers_destination_type_enum"`);
  }
}
