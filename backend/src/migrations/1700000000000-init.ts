import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await queryRunner.query(`CREATE TYPE "user_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');`);
    await queryRunner.query(`CREATE TYPE "kyc_status_enum" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED');`);
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('USER', 'ADMIN');`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "phone_number" character varying(20) NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "pin_hash" character varying(255),
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "status" "user_status_enum" NOT NULL DEFAULT 'PENDING',
        "kyc_status" "kyc_status_enum" NOT NULL DEFAULT 'UNVERIFIED',
        "last_login_at" TIMESTAMPTZ,
        "role" "user_role_enum" NOT NULL DEFAULT 'USER',
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone_number"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "account_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
    `);
    await queryRunner.query(`
      CREATE TYPE "account_type_enum" AS ENUM ('WALLET_MAIN', 'WALLET_ESCROW', 'TREASURY', 'FEES', 'RESERVE');
    `);
    await queryRunner.query(`
      CREATE TYPE "currency_enum" AS ENUM ('NGN', 'USD');
    `);
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid,
        "currency" "currency_enum" NOT NULL,
        "type" "account_type_enum" NOT NULL,
        "status" "account_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "label" character varying(128),
        "balance_minor" bigint NOT NULL DEFAULT '0',
        CONSTRAINT "PK_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "journal_status_enum" AS ENUM ('POSTED', 'REVERSED');
    `);
    await queryRunner.query(`
      CREATE TYPE "entry_direction_enum" AS ENUM ('DEBIT', 'CREDIT');
    `);
    await queryRunner.query(`
      CREATE TABLE "journal_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "reference" character varying(64) NOT NULL,
        "idempotency_key" character varying(128),
        "status" "journal_status_enum" NOT NULL DEFAULT 'POSTED',
        "description" character varying(255),
        "metadata" jsonb,
        CONSTRAINT "PK_journal_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_journal_entries_reference" UNIQUE ("reference"),
        CONSTRAINT "UQ_journal_entries_idempotency" UNIQUE ("idempotency_key")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "journal_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "journal_entry_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "direction" "entry_direction_enum" NOT NULL,
        "amount_minor" bigint NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "memo" character varying(255),
        CONSTRAINT "PK_journal_lines_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_journal_lines_entry" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_journal_lines_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_journal_lines_account" ON "journal_lines" ("account_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "jti" character varying(64) NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_jti" UNIQUE ("jti"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens";`);
    await queryRunner.query(`DROP INDEX "IDX_journal_lines_account";`);
    await queryRunner.query(`DROP TABLE "journal_lines";`);
    await queryRunner.query(`DROP TABLE "journal_entries";`);
    await queryRunner.query(`DROP TABLE "accounts";`);
    await queryRunner.query(`DROP TABLE "users";`);
    await queryRunner.query(`DROP TYPE "entry_direction_enum";`);
    await queryRunner.query(`DROP TYPE "journal_status_enum";`);
    await queryRunner.query(`DROP TYPE "account_status_enum";`);
    await queryRunner.query(`DROP TYPE "account_type_enum";`);
    await queryRunner.query(`DROP TYPE "currency_enum";`);
    await queryRunner.query(`DROP TYPE "kyc_status_enum";`);
    await queryRunner.query(`DROP TYPE "user_role_enum";`);
    await queryRunner.query(`DROP TYPE "user_status_enum";`);
  }
}
