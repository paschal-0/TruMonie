import { MigrationInterface, QueryRunner } from 'typeorm';

export class AjoPenaltyReplace1700000007000 implements MigrationInterface {
  name = 'AjoPenaltyReplace1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "group_contributions" ADD COLUMN "penalty_minor" bigint NOT NULL DEFAULT '0';`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_contributions" DROP COLUMN "penalty_minor";`);
  }
}
