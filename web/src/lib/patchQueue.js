// Debounced, serialized patch sender. Patches pushed within delayMs of each
// other are shallow-merged into one send; only one send is in flight at a time.
export function createPatchQueue({ send, delayMs = 300 }) {
  let batch = null; // { patch, waiters: [{ resolve, reject }] }
  let timer = null;
  let ready = false; // delay elapsed (or flush requested) for the current batch
  let inFlight = false;
  let disposed = false;

  async function run() {
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
      run();
    }
  }

  function push(patch) {
    return new Promise((resolve, reject) => {
      if (disposed) {
        reject(new Error('patch queue disposed'));
        return;
      }
      if (!batch) batch = { patch: {}, waiters: [] };
      batch.patch = { ...batch.patch, ...patch };
      batch.waiters.push({ resolve, reject });
      ready = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        ready = true;
        run();
      }, delayMs);
    });
  }

  // Send the pending batch now (after the in-flight send, if there is one).
  function flush() {
    clearTimeout(timer);
    timer = null;
    ready = true;
    run();
  }

  // Cancel the pending batch and reject its pushes; an in-flight send still settles its own.
  function dispose() {
    disposed = true;
    clearTimeout(timer);
    timer = null;
    if (batch) {
      const { waiters } = batch;
      batch = null;
      waiters.forEach((w) => w.reject(new Error('patch queue disposed')));
    }
  }

  return { push, flush, dispose };
}
