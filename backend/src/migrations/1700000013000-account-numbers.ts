import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountNumbers1700000013000 implements MigrationInterface {
  name = 'AccountNumbers1700000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "account_number" character varying(10)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_accounts_account_number" ON "accounts" ("account_number")`
    );

    await queryRunner.query(`
      DO $$
      DECLARE
        acc RECORD;
        candidate TEXT;
      BEGIN
        FOR acc IN
          SELECT id
          FROM accounts
          WHERE type = 'WALLET_MAIN'
            AND currency = 'NGN'
            AND account_number IS NULL
        LOOP
          LOOP
            candidate := '34' || LPAD((floor(random() * 100000000))::text, 8, '0');
            EXIT WHEN NOT EXISTS (
              SELECT 1 FROM accounts WHERE account_number = candidate
            );
          END LOOP;

          UPDATE accounts
          SET account_number = candidate
          WHERE id = acc.id;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_accounts_account_number"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "account_number"`);
  }
}
