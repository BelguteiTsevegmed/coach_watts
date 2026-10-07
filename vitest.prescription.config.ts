import { defineConfig } from 'vitest/config'

// Deliberately independent of Nuxt, dotenv, Prisma and the global unit-test setup.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/evaluation/prescription.test.ts'],
    testTimeout: 30_000
  }
})
