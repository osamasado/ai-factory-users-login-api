import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, Role } from './interfaces/user.interface';


@Injectable()
export class UsersService {
    private users: User[] = [];
    private loginHistory = new Map<string, Date[]>();

    create(user: CreateUserDto) {
        const newUser: User = {
            id: Date.now().toString(),
            name: user.name,
            email: user.email,
            password: user.password,
            role: Role.USER, // Default role, can be changed based on your requirements
        };

        this.users.push(newUser);
        return newUser;
    }

    findAll() {
        return this.users;
    }

    findByEmail(email: string) {
        return this.users.find((u) => u.email === email);
    }

    findOne(id: string) {
        const user = this.users.find((u) => u.id === id);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    update(id: string, userData: UpdateUserDto) {
        const user = this.findOne(id);
        Object.assign(user, userData);
        return user;
    }

    remove(id: string) {
        const index = this.users.findIndex(u => u.id === id);
        if (index === -1) throw new NotFoundException('User not found');

        this.users.splice(index, 1);
        return { message: 'Deleted successfully' };
    }

    recordLogin(id: string): void {
        const entries = this.loginHistory.get(id) ?? [];
        entries.push(new Date());
        this.loginHistory.set(id, entries);
    }

    getLoginHistory(id: string): Date[] {
        this.findOne(id);
        return this.loginHistory.get(id) ?? [];
    }
}
