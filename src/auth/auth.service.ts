import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly usersService: UsersService,
    ) {}

    async register(name: string, email: string, password: string) {
        const hashed = await bcrypt.hash(password, 10);

        this.usersService.create({ name, email, password: hashed });

        return { message: 'User created' };
    }

    async login(email: string, password: string) {
        const user = this.usersService.findByEmail(email);

        if (!user) throw new UnauthorizedException('Invalid credentials');

        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) throw new UnauthorizedException('Invalid credentials');

        const token = this.jwtService.sign({
            id: user.id,
            email: user.email,
            role: user.role,
        });

        this.usersService.recordLogin(user.id);

        return { access_token: token };
    }
}
