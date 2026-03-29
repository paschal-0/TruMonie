import { MigrationInterface, QueryRunner } from 'typeorm';

export class KycAndPayouts1700000002000 implements MigrationInterface {
  name = 'KycAndPayouts1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'limit_tier_enum') THEN
          CREATE TYPE "limit_tier_enum" AS ENUM ('TIER0', 'TIER1', 'TIER2');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "limit_tier" "limit_tier_enum" NOT NULL DEFAULT 'TIER0';`
    );

    await queryRunner.query(`
      CREATE TABLE "user_kyc_data" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "bvn_encrypted" character varying(512),
        "nin_encrypted" character varying(512),
        "address_encrypted" character varying(1024),
        "dob_encrypted" character varying(512),
        "selfie_url" character varying(512),
        "metadata" jsonb,
        CONSTRAINT "PK_user_kyc_data_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_kyc_data_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "source_account_id" uuid NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "amount_minor" bigint NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "provider" character varying(64) NOT NULL,
        "provider_reference" character varying(128),
        "failure_reason" character varying(255),
        "metadata" jsonb,
        CONSTRAINT "PK_payouts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payouts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payouts_provider_ref" ON "payouts" ("provider_reference");`);

    await queryRunner.query(`
      CREATE TABLE "funding_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "destination_account_id" uuid NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "amount_minor" bigint NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "provider" character varying(64) NOT NULL,
        "reference" character varying(128) NOT NULL,
        "metadata" jsonb,
        CONSTRAINT "PK_funding_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_funding_transactions_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_funding_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "funding_transactions";`);
    await queryRunner.query(`DROP INDEX "IDX_payouts_provider_ref";`);
    await queryRunner.query(`DROP TABLE "payouts";`);
    await queryRunner.query(`DROP TABLE "user_kyc_data";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "limit_tier";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "limit_tier_enum";`);
  }
}
