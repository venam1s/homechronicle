// How long a downloaded blob's object URL stays valid. Revoking it right after
// click() can cancel the download in Firefox-based browsers, which start reading
// the URL asynchronously.
const REVOKE_AFTER_MS = 60_000;

/**
 * Save a Blob as a file download. The anchor is attached to the document for the
 * click (Firefox ignores clicks on detached anchors in some versions) and removed
 * straight after; the object URL is revoked later, once the browser has it.
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}
