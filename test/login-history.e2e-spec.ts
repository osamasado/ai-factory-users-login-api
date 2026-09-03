import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Login history (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /users/:id/login-history returns 404 for an unknown id', () => {
    return request(app.getHttpServer())
      .get('/users/does-not-exist/login-history')
      .expect(404);
  });

  it('GET /users/:id/login-history requires no Authorization header', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Hana', email: 'hana@example.com', password: 'password123' });
    expect(registerRes.status).toBe(201);

    const usersRes = await request(app.getHttpServer()).get('/users');
    const user = usersRes.body.find((u: any) => u.email === 'hana@example.com');

    await request(app.getHttpServer())
      .get(`/users/${user.id}/login-history`)
      .expect(200); // no Authorization header set at all
  });

  it('records and returns login history end-to-end', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ivan', email: 'ivan@example.com', password: 'password123' })
      .expect(201);
    const usersRes = await request(app.getHttpServer()).get('/users');
    const user = usersRes.body.find((u: any) => u.email === 'ivan@example.com');

    await request(app.getHttpServer())
      .get(`/users/${user.id}/login-history`)
      .expect(200)
      .expect([]);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ivan@example.com', password: 'password123' })
      .expect(201); // Nest's default 2xx for POST is 201 unless @HttpCode overrides it

    const historyRes = await request(app.getHttpServer())
      .get(`/users/${user.id}/login-history`)
      .expect(200);
    expect(historyRes.body).toHaveLength(1);
  });
});
