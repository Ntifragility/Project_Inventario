export function normalizeOneDriveUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl;
  }

  const url = rawUrl.trim();

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes('1drv.ms')) {
      // Short OneDrive links usually redirect to the actual file URL.
      return url;
    }

    if (hostname.includes('onedrive.live.com')) {
      const resid = parsed.searchParams.get('resid');
      const authkey = parsed.searchParams.get('authkey');
      if (resid) {
        const directUrl = new URL('https://onedrive.live.com/download');
        directUrl.searchParams.set('resid', resid);
        if (authkey) {
          directUrl.searchParams.set('authkey', authkey);
        }
        return directUrl.toString();
      }

      const cid = parsed.searchParams.get('cid');
      const id = parsed.searchParams.get('id');
      if (cid && id) {
        return `https://onedrive.live.com/download?cid=${cid}&id=${id}`;
      }
    }
  } catch (error) {
    // Fall back to the original URL when parsing fails.
  }

  return url;
}
