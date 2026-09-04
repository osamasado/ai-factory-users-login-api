import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('GET /users/me (e2e)', () => {
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

  it('GET /users/me without Authorization header returns 401', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('GET /users/me with an invalid token returns 401', async () => {
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('GET /users/me returns the logged-in user profile without the password field', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Mona', email: 'mona@example.com', password: 'password123' })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'mona@example.com', password: 'password123' })
      .expect(201);

    const token = loginRes.body.access_token;

    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe('mona@example.com');
    expect(res.body.name).toBe('Mona');
    expect(res.body).toHaveProperty('role');
    expect(res.body).toHaveProperty('id');
    expect(res.body.password).toBeUndefined();
    expect(Object.keys(res.body)).not.toContain('password');
  });
});
