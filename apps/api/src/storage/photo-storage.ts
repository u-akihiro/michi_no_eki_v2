type R2PutBody =
  ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob

export const createPhotoStorage = (bucket: R2Bucket) => ({
  put: (key: string, body: R2PutBody, opts?: R2PutOptions) =>
    bucket.put(key, body, opts),
  get: (key: string) => bucket.get(key),
  delete: (key: string) => bucket.delete(key),
})
