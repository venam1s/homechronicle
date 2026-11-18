// Debounced, serialized patch sender. Patches pushed within delayMs of each
// other are shallow-merged into one send; only one send is in flight at a time.
export function createPatchQueue({ send, delayMs = 300 }) {
  let batch = null; // { patch, waiters: [{ resolve, reject }] }
  let timer = null;
  let ready = false; // delay elapsed for the current batch
  let inFlight = false;
  let disposed = false;

  async function flush() {
    if (disposed || inFlight || !batch || !ready) return;
    const { patch, waiters } = batch;
    batch = null;
    ready = false;
    inFlight = true;
    try {
      const result = await send(patch);
      waiters.forEach((w) => w.resolve(result));
    } catch (err) {
      waiters.forEach((w) => w.reject(err));
    } finally {
      inFlight = false;
      flush();
    }
  }

  function push(patch) {
    return new Promise((resolve, reject) => {
      if (!batch) batch = { patch: {}, waiters: [] };
      batch.patch = { ...batch.patch, ...patch };
      batch.waiters.push({ resolve, reject });
      ready = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        ready = true;
        flush();
      }, delayMs);
    });
  }

  function dispose() {
    disposed = true;
    clearTimeout(timer);
    timer = null;
  }

  return { push, dispose };
}
