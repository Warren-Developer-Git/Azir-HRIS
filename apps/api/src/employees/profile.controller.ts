import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service.js';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller('me')
export class ProfileController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthUser) {
    return this.employeesService.getProfile(user);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.employeesService.updateProfile(user, dto);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.employeesService.uploadAvatar(user, file);
  }

  @Delete('avatar')
  async removeAvatar(@CurrentUser() user: AuthUser) {
    return this.employeesService.removeAvatar(user);
  }
}
