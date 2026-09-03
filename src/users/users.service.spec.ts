import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login history', () => {
    it('throws NotFoundException for an unknown user id', () => {
      expect(() => service.getLoginHistory('does-not-exist')).toThrow(NotFoundException);
    });

    it('returns an empty array for a known user with no recorded logins', () => {
      const user = service.create({ name: 'Bob', email: 'bob@example.com', password: 'password123' });
      expect(service.getLoginHistory(user.id)).toEqual([]);
    });

    it('returns recorded timestamps after recordLogin is called', () => {
      const user = service.create({ name: 'Cara', email: 'cara@example.com', password: 'password123' });
      service.recordLogin(user.id);
      service.recordLogin(user.id);
      const history = service.getLoginHistory(user.id);
      expect(history).toHaveLength(2);
      expect(history[0]).toBeInstanceOf(Date);
    });
  });
});
