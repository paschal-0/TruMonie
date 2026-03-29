import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';

@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.cardsService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateCardDto) {
    return this.cardsService.create(user.id, dto);
  }

  @Patch(':id/block')
  block(@CurrentUser() user: User, @Param('id') id: string) {
    return this.cardsService.block(user.id, id);
  }

  @Patch(':id/unblock')
  unblock(@CurrentUser() user: User, @Param('id') id: string) {
    return this.cardsService.unblock(user.id, id);
  }
}
