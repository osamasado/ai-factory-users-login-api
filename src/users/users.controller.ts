import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth/auth.guard';
import { Role } from '../users/interfaces/user.interface';
import { RolesGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';


@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Post()
    createUser(@Body() userData: CreateUserDto) {
        return this.usersService.create(userData);
    }

    // @UseGuards(JwtAuthGuard)
    @Get()
    getAllUsers() {
        return this.usersService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(id);
    }

    @Put(':id')
    updateUser(@Param('id') id: string, @Body() userData: UpdateUserDto) {
        return this.usersService.update(id, userData);
    }

    @Delete(':id')
    deleteUser(@Param('id') id: string) {
        return this.usersService.remove(id);
    }

    @Get(':id/login-history')
    getLoginHistory(@Param('id') id: string) {
        return this.usersService.getLoginHistory(id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get('admin-only')
    getAdminData() {
        return 'Only admin can see this';
    }
}
