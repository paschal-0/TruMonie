import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  ForbiddenException
} from '@nestjs/common';

import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetTransactionPinDto } from './dto/set-transaction-pin.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/pin-status')
  async pinStatus(@CurrentUser() requester: User) {
    return this.usersService.getTransactionPinStatus(requester.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/pin')
  async setPin(@CurrentUser() requester: User, @Body() dto: SetTransactionPinDto) {
    return this.usersService.setTransactionPin(requester.id, dto.pin, dto.currentPin);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@CurrentUser() requester: User, @Param('id') id: string): Promise<User> {
    if (requester.id !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
