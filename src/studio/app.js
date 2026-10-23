// One place that redraws everything after the room changes.
import { S } from "./state.js";
import { settleAll } from "./stacking.js";
import { renderPlan } from "./plan.js";
import { renderInspect } from "./inspector.js";
import { renderEst } from "./estimate.js";
import { buildRoom } from "./three/room.js";
import { buildItems, syncItem, refreshHelper } from "./three/items.js";
import { saveRoom } from "./room-store.js";
import { toCm } from "./geometry.js";
import { t } from "./i18n.js";

let lastItemsKey = "";

// Plan, inspector and estimate are cheap to redraw. 3D pieces are only rebuilt when
// the set of pieces (or their type/rotation) changed; moves just reposition them.
export function update(){
  settleAll();   // pieces rest on the floor or on the surface below them
  renderPlan(); renderInspect(); renderEst();
  const size = document.getElementById("roomSize");
  if (size) size.textContent = `${toCm(S.L)} × ${toCm(S.W)} × ${toCm(S.H)} ${t("cm")}`;
  saveRoom();
  buildRoom(); // also refreshes the selected-wall highlight
  const key = S.items.map(i => `${i.id}:${i.type}:${i.rot}`).join("|");
  if (key !== lastItemsKey){ lastItemsKey = key; buildItems(); }
  else { S.items.forEach(syncItem); refreshHelper(); }
}

// Force a full 3D rebuild (e.g. after the room size changed).
export function rebuildAll(){ lastItemsKey = ""; update(); }
