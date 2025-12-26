// Browser Compatibility Shim
// Provides a unified API for Chrome and Firefox extensions

export const api = typeof browser !== 'undefined' ? browser : chrome;
export const isFirefox = typeof browser !== 'undefined';
export const isChrome = typeof chrome !== 'undefined' && typeof browser === 'undefined';
