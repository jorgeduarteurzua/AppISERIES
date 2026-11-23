import type { ApiPuente } from '../electron/preload/preload';

declare global {
  interface Window {
    api: ApiPuente;
  }
}

export {};
