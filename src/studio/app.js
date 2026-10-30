// One place that redraws everything after the room changes.
import { S } from "./state.js";
import { settleAll } from "./stacking.js";
import { buildRoom } from "./three/room.js";
import { buildItems, syncItem, refreshHelper } from "./three/items.js";
import { saveRoom } from "./room-store.js";
import { notify } from "./store.js";

let lastItemsKey = null;   // null: rebuild the 3D pieces next time (an empty room's key is "")

// The panels (plan, selection bar, estimate, library) redraw through notify(). 3D pieces are only
// rebuilt when the set of pieces (or their type/rotation) changed; moves just reposition them.
export function update(){
  settleAll();   // pieces rest on the floor or on the surface below them
  notify();
  saveRoom();
  buildRoom(); // also refreshes the selected-wall highlight
  const key = S.items.map(i => `${i.id}:${i.type}:${i.rot}`).join("|");
  if (key !== lastItemsKey){ lastItemsKey = key; buildItems(); }
  else { S.items.forEach(syncItem); refreshHelper(); }
}

// Force a full 3D rebuild (e.g. after the room size changed).
export function rebuildAll(){ lastItemsKey = null; update(); }
