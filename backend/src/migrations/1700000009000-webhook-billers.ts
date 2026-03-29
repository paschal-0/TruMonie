import { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookBillers1700000009000 implements MigrationInterface {
  name = 'WebhookBillers1700000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "provider" character varying(64) NOT NULL,
        "event_type" character varying(128) NOT NULL,
        "idempotency_key" character varying(128),
        "payload" jsonb NOT NULL,
        CONSTRAINT "PK_webhook_events_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "bill_beneficiaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "nickname" character varying(255) NOT NULL,
        "product_code" character varying(64) NOT NULL,
        "destination" character varying(128) NOT NULL,
        CONSTRAINT "PK_bill_beneficiaries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bill_beneficiaries_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bill_beneficiaries";`);
    await queryRunner.query(`DROP TABLE "webhook_events";`);
  }
}
