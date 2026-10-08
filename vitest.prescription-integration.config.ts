import { defineConfig } from 'vitest/config'
import 'dotenv/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/training-prescription.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
})
