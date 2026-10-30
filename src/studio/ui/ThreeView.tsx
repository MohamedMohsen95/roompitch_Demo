// The 3D panel: shows the shared three.js canvas (three/scene.js) and takes drops from the library.
// Its header holds the camera views and the light settings; how to move things is a caption on the view.
import { useEffect, useRef, useState } from "react";
import { attachScene } from "../three/scene.js";
import { dropIn3D } from "../three/interaction.js";
import { t } from "../i18n.js";
import { CameraViews, LightMenu } from "./ViewBar";
import { MaxButton, ViewRail, viewClass, type MaxProps } from "./ViewMax";

export default function ThreeView({max, onMax}: MaxProps){
  const host = useRef<HTMLDivElement>(null);
  const [dropOn, setDropOn] = useState(false);
  useEffect(() => attachScene(host.current), []);
  return (
    <div className={viewClass("3d", max)}>
      <ViewRail title="3D" onMax={onMax}/>
      <div className="phead">
        <h2>3D</h2>
        <div className="phead-tools"><CameraViews/><LightMenu/><MaxButton id="3d" max={max} onMax={onMax}/></div>
      </div>
      <div className={"stage" + (dropOn ? " drop-on" : "")}>
        <div id="three" ref={host}
          onDragOver={e => { e.preventDefault(); setDropOn(true); }}
          onDragLeave={() => setDropOn(false)}
          onDrop={e => {
            e.preventDefault(); setDropOn(false);
            const payload = e.dataTransfer.getData("text/plain");
            if (payload) dropIn3D(e.clientX, e.clientY, payload);
          }}/>
        <p className="caption">{t("threeHint")}</p>
      </div>
    </div>
  );
}
