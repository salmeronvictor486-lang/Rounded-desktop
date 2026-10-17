import 'fake-indexeddb/auto';

// jsdom no implementa algunas APIs usadas por la aplicación
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (v: any) => JSON.parse(JSON.stringify(v));
}
