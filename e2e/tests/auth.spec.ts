import { expect, test } from '@playwright/test'
import { getSessionUser, loginAs } from '../helpers/auth.ts'

test.describe('authenticated flows', () => {
  test('E2E login API creates a session and opens dashboard', async ({ page }) => {
    await loginAs(page)

    const session = await getSessionUser(page)
    expect(session?.user?.email).toBe(process.env.E2E_TEST_USER_EMAIL)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page).toHaveTitle(/Today/i)
  })
})
