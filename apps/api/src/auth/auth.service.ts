import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private get accessSecret(): string {
    return (
      process.env.JWT_ACCESS_SECRET ||
      'dev_access_secret_hrms_2026_super_secure'
    );
  }

  private get refreshSecret(): string {
    return (
      process.env.JWT_REFRESH_SECRET ||
      'dev_refresh_secret_hrms_2026_super_secure'
    );
  }

  async login(dto: LoginDto, res: Response) {
    const lookup = await this.prisma.loginLookup(dto.email);
    if (!lookup || !lookup.active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const validPassword = bcrypt.compareSync(dto.password, lookup.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Load full user, employee, and tenant details within tenant context
    const fullUser = await this.prisma.withTenant(lookup.tenantId, async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: lookup.id },
        include: {
          tenant: true,
          employee: true,
        },
      });
      return u;
    });

    if (!fullUser || !fullUser.employee) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: fullUser.id,
      tid: fullUser.tenantId,
      eid: fullUser.employee.id,
      roles: fullUser.roles,
      email: fullUser.email,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: fullUser.id, tid: fullUser.tenantId },
      {
        secret: this.refreshSecret,
        expiresIn: '7d',
      },
    );

    // Set refresh token in httpOnly cookie
    // shortcut: refresh tokens can't be revoked before expiry, add a token table when logout-everywhere is needed
    res.cookie('refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const name = `${fullUser.employee.firstName} ${fullUser.employee.lastName}`.trim();

    return {
      accessToken,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        roles: fullUser.roles,
        employeeId: fullUser.employee.id,
        name,
        tenantName: fullUser.tenant.name,
      },
    };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string; tid: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const fullUser = await this.prisma.withTenant(payload.tid, async (tx) => {
      return tx.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenant: true,
          employee: true,
        },
      });
    });

    if (!fullUser || !fullUser.active || !fullUser.employee) {
      throw new UnauthorizedException('User is no longer active');
    }

    const accessPayload = {
      sub: fullUser.id,
      tid: fullUser.tenantId,
      eid: fullUser.employee.id,
      roles: fullUser.roles,
      email: fullUser.email,
    };

    const newAccessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: '15m',
    });

    const newRefreshToken = await this.jwtService.signAsync(
      { sub: fullUser.id, tid: fullUser.tenantId },
      {
        secret: this.refreshSecret,
        expiresIn: '7d',
      },
    );

    res.cookie('refresh', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const name = `${fullUser.employee.firstName} ${fullUser.employee.lastName}`.trim();

    return {
      accessToken: newAccessToken,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        roles: fullUser.roles,
        employeeId: fullUser.employee.id,
        name,
        tenantName: fullUser.tenant.name,
      },
    };
  }

  logout(res: Response) {
    res.clearCookie('refresh', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }

  async getMe(userId: string, tenantId: string) {
    const user = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.user.findUnique({
        where: { id: userId },
        include: {
          tenant: true,
          employee: true,
        },
      });
    });

    if (!user || !user.employee) {
      throw new UnauthorizedException('User not found');
    }

    const name = `${user.employee.firstName} ${user.employee.lastName}`.trim();
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      employeeId: user.employee.id,
      name,
      tenantName: user.tenant.name,
    };
  }
}
