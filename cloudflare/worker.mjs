export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.fluorescentmice.fun' || url.hostname === 'fluorescentmice.fun') {
      return Response.redirect(`https://attic.fluorescentmice.fun${url.pathname}${url.search}`, 308);
    }
    return env.ASSETS.fetch(request);
  }
};
