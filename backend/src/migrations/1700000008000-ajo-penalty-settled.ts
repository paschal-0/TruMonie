import { MigrationInterface, QueryRunner } from 'typeorm';

export class AjoPenaltySettled1700000008000 implements MigrationInterface {
  name = 'AjoPenaltySettled1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "group_contributions" ADD COLUMN "penalty_settled" boolean NOT NULL DEFAULT false;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_contributions" DROP COLUMN "penalty_settled";`);
  }
}
