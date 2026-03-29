import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSavingsAccounts1700000010000 implements MigrationInterface {
  name = 'AddSavingsAccounts1700000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "account_type_enum" ADD VALUE IF NOT EXISTS 'SAVINGS';`);
    await queryRunner.query(`
      CREATE TABLE "savings_vaults" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "target_amount_minor" bigint NOT NULL DEFAULT '0',
        "balance_minor" bigint NOT NULL DEFAULT '0',
        "locked_until" TIMESTAMPTZ,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_savings_vaults_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_savings_vault_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "savings_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "vault_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "direction" character varying(16) NOT NULL,
        "amount_minor" bigint NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "reference" character varying(128) NOT NULL,
        CONSTRAINT "PK_savings_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_savings_transactions_vault" FOREIGN KEY ("vault_id") REFERENCES "savings_vaults"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_savings_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "savings_transactions";`);
    await queryRunner.query(`DROP TABLE "savings_vaults";`);
  }
}
