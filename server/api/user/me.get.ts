import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { getUserEntitlements } from '../../utils/entitlements'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }
  const userId = session.user.id

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      nutritionTrackingEnabled: true,
      dashboardSettings: true,
      isAdmin: true,
      language: true,
      uiLanguage: true
    }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  return {
    ...user,
    entitlements: getUserEntitlements()
  }
})
