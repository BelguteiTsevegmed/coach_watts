import type { Queue } from 'bullmq'

/** BullMQ matches worker names across CLIENT LIST, which spans every Redis database. */
export async function getQueueWorkers(queue: Pick<Queue, 'client' | 'getWorkers'>) {
  const [client, workers] = await Promise.all([queue.client, queue.getWorkers()])
  const database = Number(client.options.db ?? 0)

  return workers.filter(
    (worker) => worker.db !== undefined && worker.db.trim() !== '' && Number(worker.db) === database
  )
}
