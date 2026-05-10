import BZip2 from "./vendor/bzip2.js";

const apiPromise = (async () => {
  const api = new BZip2("./vendor/bzip2-1.0.8/bzip2.wasm");
  await api.init();
  return api;
})();

export async function compressFile(uint8) {
  const api = await apiPromise;

  return api.compress(uint8);
}

export async function decompressFile(uint8) {
  const api = await apiPromise;

  return api.decompress(uint8);
}
