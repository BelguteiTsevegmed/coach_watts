/** Stop waiting even when a dependency does not implement AbortSignal itself. */
export function awaitWithAbort<T>(operation: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const error = new Error(String(signal.reason || 'Operation aborted.'))
      error.name = 'AbortError'
      reject(error)
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    // Always observe the operation, including rejection after the caller stops waiting.
    Promise.resolve(operation).then(
      (value) => {
        cleanup()
        if (signal.aborted) onAbort()
        else resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Optional work must neither occupy a chat runner slot nor outlive its own deadline. */
export function runChatMaintenance(
  task: (signal: AbortSignal) => Promise<unknown>,
  onError: (error: unknown) => void,
  timeoutMs = 15_000
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('Chat maintenance timed out.'), timeoutMs)
  timer.unref?.()
  void awaitWithAbort(
    Promise.resolve().then(() => task(controller.signal)),
    controller.signal
  )
    .catch(onError)
    .finally(() => clearTimeout(timer))
}
