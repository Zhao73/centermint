// centermint.app: one canonical address. http, www and any other host 301 to https://centermint.app,
// then the static site is served from the bundled assets.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const preview = url.hostname.endsWith('.workers.dev');
    if (!preview && (url.hostname !== 'centermint.app' || url.protocol !== 'https:')) {
      url.hostname = 'centermint.app';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    // IndexNow key (Bing / Yandex / Seznam): lets us push changed URLs instead of waiting for a crawl.
    if (url.pathname === '/d9dfd694c1b64e4d02af725ab72b8873.txt') {
      return new Response('d9dfd694c1b64e4d02af725ab72b8873', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    // Search Console ownership file: served as-is (the asset layer would 307 away the .html).
    if (url.pathname === '/google186cf6e07f136ff4.html') {
      return new Response('google-site-verification: google186cf6e07f136ff4.html', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return env.ASSETS.fetch(request);
  }
};
