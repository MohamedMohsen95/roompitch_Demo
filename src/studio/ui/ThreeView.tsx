// The 3D panel: shows the shared three.js canvas (three/scene.js) and takes drops from the library.
import { useEffect, useRef, useState } from "react";
import { attachScene } from "../three/scene.js";
import { dropIn3D } from "../three/interaction.js";
import { t } from "../i18n.js";

export default function ThreeView(){
  const host = useRef<HTMLDivElement>(null);
  const [dropOn, setDropOn] = useState(false);
  useEffect(() => attachScene(host.current), []);
  return (
    <div className="panel view">
      <h2>3D <small>{t("threeHint")}</small></h2>
      <div className={"stage" + (dropOn ? " drop-on" : "")}>
        <div id="three" ref={host}
          onDragOver={e => { e.preventDefault(); setDropOn(true); }}
          onDragLeave={() => setDropOn(false)}
          onDrop={e => {
            e.preventDefault(); setDropOn(false);
            const payload = e.dataTransfer.getData("text/plain");
            if (payload) dropIn3D(e.clientX, e.clientY, payload);
          }}/>
      </div>
    </div>
  );
}
