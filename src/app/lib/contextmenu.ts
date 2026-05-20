import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

// A single right-click menu, shared app-wide (toast-style module store) so
// only one is ever open and any component can raise one.

export type CtxItem =
  | { readonly kind: "separator" }
  | {
      readonly kind: "item";
      readonly label: string;
      readonly icon?: ReactNode;
      readonly shortcut?: string;
      readonly danger?: boolean;
      readonly disabled?: boolean;
      readonly onSelect?: () => void;
      readonly submenu?: readonly CtxItem[];
    };

export type ContextMenuState = {
  readonly x: number;
  readonly y: number;
  readonly items: readonly CtxItem[];
} | null;

let state: ContextMenuState = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const openMenu = (x: number, y: number, items: readonly CtxItem[]): void => {
  state = { x, y, items };
  emit();
};

export const closeMenu = (): void => {
  if (state === null) return;
  state = null;
  emit();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): ContextMenuState => state;

export const useContextMenu = (): ContextMenuState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const separator: CtxItem = { kind: "separator" };
