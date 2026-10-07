import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const userId = session.user.id

  const activeMessages = await prisma.systemMessage.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      dismissals: {
        none: {
          userId: userId
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 5 // Fetch a few candidates in case the latest is filtered out
  })

  // If no messages, return null early
  if (activeMessages.length === 0) {
    return { message: null }
  }

  // Fetch user details needed for filtering
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true
    }
  })

  if (!user) {
    return { message: null }
  }

  const userAgeMs = Date.now() - user.createdAt.getTime()
  const selectedMessage =
    activeMessages.find(
      (message) =>
        message.type !== 'ADVERT' &&
        message.type !== 'SHARE' &&
        userAgeMs >= (message.minUserAgeDays || 0) * 24 * 60 * 60 * 1000
    ) || null

  return { message: selectedMessage }
})
