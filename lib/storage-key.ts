// Supabase Storage only allows ASCII characters in object keys.
// Encode filenames and path segments to hex so Korean/Unicode is stored safely.

export function toStorageFilename(originalName: string): string {
  return Buffer.from(originalName, 'utf8').toString('hex');
}

export function fromStorageFilename(storedName: string): string {
  try {
    return Buffer.from(storedName, 'hex').toString('utf8');
  } catch {
    return storedName;
  }
}

// Encode every segment of a slash-separated path
export function encodeStoragePath(path: string): string {
  return path.split('/').map(seg => Buffer.from(seg, 'utf8').toString('hex')).join('/');
}

// Decode every segment of a slash-separated path
export function decodeStoragePath(path: string): string {
  return path.split('/').map(seg => {
    try { return Buffer.from(seg, 'hex').toString('utf8'); } catch { return seg; }
  }).join('/');
}
