import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService + UsersService shared store', () => {
  let authService: AuthService;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [AuthService, UsersService],
    }).compile();

    authService = module.get(AuthService);
    usersService = module.get(UsersService);
  });

  it('a user registered via AuthService.register is visible to UsersService', async () => {
    await authService.register('Alice', 'alice@example.com', 'password123');
    const all = usersService.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('alice@example.com');
  });

  it('records a login timestamp on successful login', async () => {
    await authService.register('Dana', 'dana@example.com', 'password123');
    const user = usersService.findAll()[0];
    await authService.login('dana@example.com', 'password123');
    expect(usersService.getLoginHistory(user.id)).toHaveLength(1);
  });

  it('does not record a login timestamp on failed login', async () => {
    await authService.register('Eve', 'eve@example.com', 'password123');
    const user = usersService.findAll()[0];
    await expect(authService.login('eve@example.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    expect(usersService.getLoginHistory(user.id)).toEqual([]);
  });
});
