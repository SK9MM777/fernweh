import { ITEM_IDS, type GameState, type Inventory, type ItemId } from "./types";
export const STACK_SIZE = 20;
export function count(inv: Inventory, item: ItemId) {
  return inv[item] ?? 0;
}
export function usedSlots(inv: Inventory) {
  return ITEM_IDS.reduce(
    (n, id) => n + Math.ceil(count(inv, id) / STACK_SIZE),
    0,
  );
}
export function capacity(state: GameState) {
  return state.equipment.tools.backpack ? 36 : 24;
}
export function hasItems(inv: Inventory, cost: Inventory) {
  return ITEM_IDS.every((id) => count(inv, id) >= count(cost, id));
}
export function canAdd(inv: Inventory, items: Inventory, limit = 24) {
  const next = { ...inv };
  for (const id of ITEM_IDS) next[id] = count(next, id) + count(items, id);
  return usedSlots(next) <= limit;
}
export function addItems(inv: Inventory, items: Inventory, limit = 24) {
  if (!canAdd(inv, items, limit)) return false;
  for (const id of ITEM_IDS) {
    const n = count(items, id);
    if (n) inv[id] = count(inv, id) + n;
  }
  return true;
}
export function consume(inv: Inventory, cost: Inventory) {
  if (!hasItems(inv, cost)) return false;
  for (const id of ITEM_IDS) {
    const n = count(cost, id);
    if (n) {
      inv[id] = count(inv, id) - n;
      if (inv[id] === 0) delete inv[id];
    }
  }
  return true;
}
export function transfer(
  from: Inventory,
  to: Inventory,
  item: ItemId,
  amount: number,
  limit: number,
) {
  const n = Math.max(0, Math.min(Math.floor(amount), count(from, item)));
  if (!n || !canAdd(to, { [item]: n }, limit)) return false;
  consume(from, { [item]: n });
  addItems(to, { [item]: n }, limit);
  return true;
}
