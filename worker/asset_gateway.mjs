/**
 * Contract: the worker in front of the static files. Invoked only for
 * requests no asset matched; a success passes through untouched, an error
 * response carries `Cache-Control: no-store` so an edge never keeps a 404
 * from before a deploy, and `Access-Control-Allow-Origin: *` so a browser
 * client can read the status.
 */
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status < 400) {
      return response
    }
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
