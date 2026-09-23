export function linkKey(value) {
  try {
    const url = new URL(String(value).trim());
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.protocol = 'https:';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm|share_|vd_source)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.hostname === 'github.com') {
      url.pathname = url.pathname.toLowerCase().replace(/\.git$/, '');
    }
    url.searchParams.sort();
    return url.href;
  } catch { return ''; }
}

export function uniqueLinks(links) {
  const seen = new Set();
  return links.filter(link => {
    const key = linkKey(link?.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
