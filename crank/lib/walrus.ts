/** Walrus blob storage helpers. */

export async function storeBlob(
  publisherUrl: string,
  data: Uint8Array,
): Promise<string> {
  const response = await fetch(`${publisherUrl}/v1/blobs`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  if (!response.ok) {
    throw new Error(
      `Walrus store failed: ${response.status} ${response.statusText}`,
    );
  }
  const result = await response.json();
  // Walrus returns { newlyCreated: { blobObject: { blobId } } } or { alreadyCertified: { blobId } }
  if (result.newlyCreated) {
    return result.newlyCreated.blobObject.blobId;
  }
  if (result.alreadyCertified) {
    return result.alreadyCertified.blobId;
  }
  throw new Error(`Unexpected Walrus response: ${JSON.stringify(result)}`);
}

export async function readBlob(
  aggregatorUrl: string,
  blobId: string,
): Promise<Uint8Array> {
  const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);
  if (!response.ok) {
    throw new Error(`Walrus read failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
