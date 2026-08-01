const IMAGE_HOST = 'https://images.hive.blog';

export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'images.hive.blog';
  } catch {
    return false;
  }
}

export async function uploadSignedImage(
  username: string,
  signature: string,
  file: File | Blob,
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('image', file);

  const res = await fetch(`${IMAGE_HOST}/${username}/${signature}`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 413) throw new Error('Image too large for images.hive.blog');
    if (res.status === 429) throw new Error('Upload rate limited — try again later');
    throw new Error(text || `Upload failed (${res.status})`);
  }

  const json = (await res.json().catch(() => null)) as
    | { url?: string; imageUrl?: string }
    | string
    | null;

  let url = '';
  if (typeof json === 'string') url = json;
  else if (json && typeof json === 'object') url = json.url || json.imageUrl || '';

  if (!url) {
    // Some hosts return plain text URL
    const text = await res.clone().text().catch(() => '');
    url = text.trim();
  }

  if (!isAllowedImageUrl(url)) {
    throw new Error('Upload response URL rejected (must be https://images.hive.blog/…)');
  }
  return url;
}
