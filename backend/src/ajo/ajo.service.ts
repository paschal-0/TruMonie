import {
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AccountsService } from '../ledger/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { User } from '../users/entities/user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupContribution } from './entities/group-contribution.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupPayout } from './entities/group-payout.entity';
import { SavingsGroup } from './entities/savings-group.entity';
import { MemberStatus } from './enums/member-status.enum';
import { GroupStatus } from './enums/group-status.enum';
import { UpdateGroupScheduleDto } from './dto/update-group-schedule.dto';
import { GroupActivity } from './entities/group-activity.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ReorderMembersDto } from './dto/reorder-members.dto';
import { AjoQueue } from './ajo.queue';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { ReplaceMemberDto } from './dto/replace-member.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AjoService {
  constructor(
    @InjectRepository(SavingsGroup)
    private readonly groupRepo: Repository<SavingsGroup>,
    @InjectRepository(GroupMember)
    private readonly memberRepo: Repository<GroupMember>,
    @InjectRepository(GroupContribution)
    private readonly contribRepo: Repository<GroupContribution>,
    @InjectRepository(GroupPayout)
    private readonly payoutRepo: Repository<GroupPayout>,
    @InjectRepository(GroupActivity)
    private readonly activityRepo: Repository<GroupActivity>,
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => AjoQueue))
    private readonly ajoQueue: AjoQueue,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService
  ) {}

  async createGroup(user: User, dto: CreateGroupDto) {
    const escrowAccount = await this.accountsService.createEscrowAccount(dto.currency, dto.name);

    const group = this.groupRepo.create({
      name: dto.name,
      createdById: user.id,
      currency: dto.currency,
      contributionAmountMinor: dto.contributionAmountMinor.toString(),
      memberTarget: dto.memberTarget,
      status: GroupStatus.ACTIVE,
      escrowAccountId: escrowAccount.id,
      payoutIntervalDays: 7,
      nextPayoutPosition: 1,
      nextPayoutDate: this.addDays(new Date(), 7)
    });
    const saved = await this.groupRepo.save(group);

    const member = this.memberRepo.create({
      groupId: saved.id,
      userId: user.id,
      position: 1,
      status: MemberStatus.ACTIVE
   });
   await this.memberRepo.save(member);
   await this.ajoQueue.scheduleCycle(saved);
   await this.logActivity(saved.id, 'CREATE', `Group created by ${user.id}`);

   return saved;
  }

  async joinGroup(user: User, groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || group.status !== GroupStatus.ACTIVE) {
      throw new BadRequestException('Group not available');
    }
    const existing = await this.memberRepo.findOne({ where: { groupId, userId: user.id } });
    if (existing) {
      return existing;
    }
    const currentCount = await this.memberRepo.count({ where: { groupId } });
    if (currentCount >= group.memberTarget) {
      throw new BadRequestException('Group is full');
    }
    const member = this.memberRepo.create({
      groupId,
      userId: user.id,
      position: currentCount + 1,
      status: MemberStatus.ACTIVE
    });
    const saved = await this.memberRepo.save(member);
    await this.logActivity(groupId, 'JOIN', `${user.id} joined group`);
    await this.notifications.sendWithTemplate(user.id, 'AJO_JOIN', { group: group.name });
    return saved;
  }

  async collectCycle(groupId: string, cycleRef: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || !group.escrowAccountId) {
      throw new NotFoundException('Group not found');
    }
    const members = await this.memberRepo.find({ where: { groupId, status: MemberStatus.ACTIVE } });
    const amount = group.contributionAmountMinor;

    let failed = false;
    for (const member of members) {
      const wallet = await this.requireWallet(member.userId, group.currency);
      const balance = BigInt(wallet.balanceMinor);
      if (balance < BigInt(amount)) {
        const penalty = this.penaltyMinor(amount);
        const settled = await this.trySettlePenalty(group.currency, member.userId, penalty);
        await this.contribRepo.save(
          this.contribRepo.create({
            groupId,
            memberId: member.id,
            userId: member.userId,
            amountMinor: amount,
            currency: group.currency,
            cycleRef,
            status: 'FAILED',
            penaltyMinor: penalty,
            penaltySettled: settled
          })
        );
        failed = true;
        continue;
      }
      const reference = this.buildJournalReference('AJOC', group.id, cycleRef, member.userId);
      await this.ledgerService.postEntry({
        reference,
        idempotencyKey: reference,
        description: `Ajo contribution ${cycleRef}`,
        enforceNonNegative: true,
        lines: [
          {
            accountId: wallet.id,
            direction: EntryDirection.DEBIT,
            amountMinor: amount,
            currency: group.currency
          },
          {
            accountId: group.escrowAccountId,
            direction: EntryDirection.CREDIT,
            amountMinor: amount,
            currency: group.currency
          }
        ]
      });
      await this.contribRepo.save(
        this.contribRepo.create({
          groupId,
          memberId: member.id,
          userId: member.userId,
          amountMinor: amount,
          currency: group.currency,
          cycleRef,
          status: 'POSTED'
        })
      );
    }
    await this.logActivity(
      groupId,
      'COLLECT',
      `Cycle ${cycleRef} collected${failed ? ' with failures' : ''}`
    );
    return { status: failed ? 'partial' : 'collected', cycleRef };
  }

  async payout(groupId: string, memberId: string, cycleRef: string) {
    const member = await this.memberRepo.findOne({ where: { id: memberId, groupId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || !group.escrowAccountId) {
      throw new NotFoundException('Group not found');
    }
    const wallet = await this.requireWallet(member.userId, group.currency);
    const total = this.calculateCycleTotal(group);
    const reference = this.buildJournalReference('AJOP', group.id, cycleRef, member.userId);

    const entry = await this.ledgerService.postEntry({
      reference,
      idempotencyKey: reference,
      description: `Ajo payout ${cycleRef}`,
      enforceNonNegative: false,
      lines: [
        {
          accountId: group.escrowAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor: total,
          currency: group.currency
        },
        {
          accountId: wallet.id,
          direction: EntryDirection.CREDIT,
          amountMinor: total,
          currency: group.currency
        }
      ]
    });

    await this.payoutRepo.save(
      this.payoutRepo.create({
        groupId,
        memberId: member.id,
        userId: member.userId,
        amountMinor: total,
        currency: group.currency,
        cycleRef,
        status: 'PAID'
      })
    );
    await this.logActivity(groupId, 'PAYOUT', `Payout ${cycleRef} to ${member.userId}`);
    await this.notifications.send(
      member.userId,
      'AJO_PAYOUT',
      `You received ${total} ${group.currency} from group ${group.name}`
    );
    return entry;
  }

  async runCycle(groupId: string, requester: User) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || !group.escrowAccountId) {
      throw new NotFoundException('Group not found');
    }
    this.ensureAdmin(group, requester);
    const members = await this.memberRepo.find({
      where: { groupId, status: MemberStatus.ACTIVE },
      order: { position: 'ASC' }
    });
    if (members.length === 0) throw new BadRequestException('No active members');
    const cycleRef = `CYC-${Date.now()}`;
    const collectRes = await this.collectCycle(groupId, cycleRef);
    if (collectRes.status === 'partial') {
      group.nextPayoutDate = this.addDays(new Date(), 1);
      await this.groupRepo.save(group);
      await this.logActivity(
        group.id,
        'COLLECT_FAIL',
        `Cycle ${cycleRef} partial; retry scheduled`
      );
      await this.ajoQueue.scheduleCycle(group);
      return collectRes;
    }
    const nextMember = members.find((m) => m.position === group.nextPayoutPosition) ?? members[0];
    await this.payout(groupId, nextMember.id, cycleRef);
    group.lastCycleRef = cycleRef;
    group.nextPayoutPosition = this.nextPosition(group.nextPayoutPosition, members.length);
    group.nextPayoutDate = this.addDays(new Date(), group.payoutIntervalDays);
    await this.groupRepo.save(group);
    await this.ajoQueue.scheduleCycle(group);
    return { status: 'cycled', cycleRef, paidTo: nextMember.userId };
  }

  private calculateCycleTotal(group: SavingsGroup): string {
    return (BigInt(group.contributionAmountMinor) * BigInt(group.memberTarget)).toString();
  }

  private async requireWallet(userId: string, currency: Currency) {
    const accounts = await this.accountsService.getUserAccounts(userId);
    const wallet = accounts.find((a) => a.currency === currency);
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }
    return wallet;
  }

  private ensureAdmin(group: SavingsGroup, requester: User) {
    if (group.createdById !== requester.id) {
      throw new ForbiddenException('Only group creator can perform this action');
    }
  }

  private nextPosition(current: number, total: number): number {
    return current >= total ? 1 : current + 1;
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 86400000);
  }

  async updateSchedule(groupId: string, requester: User, dto: UpdateGroupScheduleDto) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    this.ensureAdmin(group, requester);
    if (dto.payoutIntervalDays) {
      group.payoutIntervalDays = dto.payoutIntervalDays;
      group.nextPayoutDate = this.addDays(new Date(), dto.payoutIntervalDays);
    }
    await this.groupRepo.save(group);
    await this.ajoQueue.scheduleCycle(group);
    return group;
  }

  async listGroupsForUser(userId: string) {
    return this.groupRepo
      .createQueryBuilder('group')
      .innerJoin('group_members', 'gm', 'gm.group_id = group.id AND gm.user_id = :userId', {
        userId
      })
      .getMany();
  }

  async getGroupDetails(userId: string, groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    const membership = await this.memberRepo.findOne({ where: { groupId, userId } });
    if (!membership && group.createdById !== userId) throw new ForbiddenException('Forbidden');
    const members = await this.memberRepo.find({ where: { groupId }, order: { position: 'ASC' } });
    return { group, members };
  }

  async removeMember(groupId: string, requester: User, dto: RemoveMemberDto) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    this.ensureAdmin(group, requester);
    const member = await this.memberRepo.findOne({ where: { id: dto.memberId, groupId } });
    if (!member) throw new NotFoundException('Member not found');
    await this.memberRepo.delete({ id: member.id });
    await this.resequence(groupId);
    await this.logActivity(groupId, 'REMOVE', `Member ${member.userId} removed`);
    return this.memberRepo.find({ where: { groupId }, order: { position: 'ASC' } });
  }

  async replaceMember(groupId: string, requester: User, dto: ReplaceMemberDto) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    this.ensureAdmin(group, requester);
    const member = await this.memberRepo.findOne({ where: { id: dto.memberId, groupId } });
    if (!member) throw new NotFoundException('Member not found');
    const user = await this.usersService.findByIdentifier(dto.newUserIdentifier);
    if (!user) throw new NotFoundException('New user not found');
    await this.memberRepo.update({ id: member.id }, { userId: user.id });
    await this.logActivity(groupId, 'REPLACE', `Member ${member.userId} replaced with ${user.id}`);
    return this.memberRepo.find({ where: { groupId }, order: { position: 'ASC' } });
  }

  async reorderMembers(groupId: string, requester: User, dto: ReorderMembersDto) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    this.ensureAdmin(group, requester);
    const members = await this.memberRepo.find({ where: { groupId }, order: { position: 'ASC' } });
    if (members.length !== dto.memberIds.length) {
      throw new BadRequestException('Member list mismatch');
    }
    const idSet = new Set(members.map((m) => m.id));
    for (const id of dto.memberIds) {
      if (!idSet.has(id)) throw new BadRequestException('Invalid member id in ordering');
    }
    let pos = 1;
    for (const id of dto.memberIds) {
      await this.memberRepo.update({ id }, { position: pos++ });
    }
    await this.logActivity(groupId, 'REORDER', 'Member order updated');
    return this.memberRepo.find({ where: { groupId }, order: { position: 'ASC' } });
  }

  async runCycleInternal(groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) return;
    await this.runCycle(groupId, { id: group.createdById } as User);
  }

  async sendReminder(groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) return;
    const members = await this.memberRepo.find({ where: { groupId, status: MemberStatus.ACTIVE } });
    const dueDate = group.nextPayoutDate;
    const amount = group.contributionAmountMinor;
    for (const member of members) {
      await this.notifications.sendWithTemplate(member.userId, 'AJO_REMINDER', {
        amount,
        currency: group.currency,
        due: dueDate?.toISOString() ?? ''
      });
    }
  }

  private async logActivity(groupId: string, type: string, message: string) {
    await this.activityRepo.save(
      this.activityRepo.create({
        groupId,
        type,
        message
      })
    );
  }

  async settleOutstandingPenalties(groupId: string, requester: User) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    this.ensureAdmin(group, requester);
    const pending = await this.contribRepo.find({
      where: { groupId, status: 'FAILED', penaltySettled: false }
    });
    for (const contrib of pending) {
      const settled = await this.trySettlePenalty(group.currency, contrib.userId, contrib.penaltyMinor);
      if (settled) {
        await this.contribRepo.update({ id: contrib.id }, { penaltySettled: true });
        await this.logActivity(groupId, 'PENALTY', `Penalty settled for ${contrib.userId}`);
      }
    }
    return { settled: pending.length };
  }

  private async resequence(groupId: string) {
    const members = await this.memberRepo.find({ where: { groupId }, order: { position: 'ASC' } });
    let pos = 1;
    for (const m of members) {
      if (m.position !== pos) {
        await this.memberRepo.update({ id: m.id }, { position: pos });
      }
      pos++;
    }
  }

  private penaltyMinor(amountMinor: string): string {
    const calc = (BigInt(amountMinor) * 1n) / 100n;
    const cap = 50000n;
    return calc > cap ? cap.toString() : calc.toString();
  }

  private async trySettlePenalty(currency: Currency, userId: string, penalty: string): Promise<boolean> {
    if (penalty === '0') return true;
    const accounts = await this.accountsService.getUserAccounts(userId);
    const wallet = accounts.find((a) => a.currency === currency);
    const feeAccount = this.configService.get<Record<string, string | undefined>>('systemAccounts.fees')?.[currency];
    if (!wallet || !feeAccount) return false;
    if (BigInt(wallet.balanceMinor) < BigInt(penalty)) return false;
    await this.ledgerService.postEntry({
      reference: `AJO-PENALTY-${userId}-${Date.now()}`,
      description: 'Ajo penalty',
      enforceNonNegative: true,
      lines: [
        {
          accountId: wallet.id,
          direction: EntryDirection.DEBIT,
          amountMinor: penalty,
          currency
        },
        {
          accountId: feeAccount,
          direction: EntryDirection.CREDIT,
          amountMinor: penalty,
          currency
        }
      ]
    });
    return true;
  }

  private buildJournalReference(
    prefix: string,
    groupId: string,
    cycleRef: string,
    userId: string
  ): string {
    const digest = createHash('sha256')
      .update(`${groupId}:${cycleRef}:${userId}`)
      .digest('hex')
      .slice(0, 24);
    return `${prefix}-${digest}`;
  }
}
