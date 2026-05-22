'use client';

type ToastFn = (msg: string, type?: 'success' | 'error') => void;

let _toastFn: ToastFn | null = null;

export function registerToast(fn: ToastFn) { _toastFn = fn; }
export function unregisterToast() { _toastFn = null; }

export function showToast(msg: string, type: 'success' | 'error' = 'success') {
  _toastFn?.(msg, type);
}
