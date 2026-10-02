import { defineConfig } from 'prisma/config';

// process.env rather than env(), so prisma generate works in the image build where no database exists.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
