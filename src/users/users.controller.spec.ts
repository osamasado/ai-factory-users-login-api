import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLoginHistory', () => {
    it('returns [] for a user with no login history', () => {
      const user = usersService.create({ name: 'Fay', email: 'fay@example.com', password: 'password123' });
      expect(controller.getLoginHistory(user.id)).toEqual([]);
    });

    it('returns recorded timestamps for a user who has logged in', () => {
      const user = usersService.create({ name: 'Gus', email: 'gus@example.com', password: 'password123' });
      usersService.recordLogin(user.id);
      expect(controller.getLoginHistory(user.id)).toHaveLength(1);
    });
  });
});
