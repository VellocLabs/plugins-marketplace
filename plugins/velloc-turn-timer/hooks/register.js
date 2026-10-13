/**
 * A status line under the prompt with the last turn's duration. The hook
 * lets the turn settle first (`next`), then reads what the engine measured.
 */
export function register(on) {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const seconds = (Number(e.durationMs) / 1000).toFixed(1)
    const outcome = e.reason === 'answer' ? '' : ` (${e.reason})`
    await $.ui.status(`Last turn: ${seconds} s${outcome}`)
    return result
  })
}
