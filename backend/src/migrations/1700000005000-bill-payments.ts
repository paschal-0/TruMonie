import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillPayments1700000005000 implements MigrationInterface {
  name = 'BillPayments1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bill_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "source_account_id" uuid NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "amount_minor" bigint NOT NULL,
        "provider" character varying(64) NOT NULL,
        "provider_reference" character varying(128) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "request" jsonb NOT NULL,
        "response" jsonb,
        CONSTRAINT "PK_bill_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bill_payments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bill_payments";`);
  }
}
