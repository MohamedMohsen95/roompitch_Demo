// The 3D panel: shows the shared three.js canvas (three/scene.js) and takes drops from the library.
// Its header holds the camera views and the light settings; how to move things is a tips box on the view (Hints.tsx).
import { useEffect, useRef, useState } from "react";
import { attachScene } from "../three/scene.js";
import { dropIn3D } from "../three/interaction.js";
import { isWalking } from "../three/walk.js";
import { useStudio } from "./hooks";
import Hints from "./Hints";
import WalkButton from "./WalkIntro";
import { t } from "../i18n.js";
import { CameraViews, LightMenu } from "./ViewBar";
import { MaxButton, ViewRail, viewClass, type MaxProps } from "./ViewMax";

// How to move things (or, while walking, how to walk).
function Caption(){
  useStudio();
  return <Hints text={t(isWalking() ? "walkHint" : "threeHint")}/>;
}

export default function ThreeView({max, onMax}: MaxProps){
  const host = useRef<HTMLDivElement>(null);
  const [dropOn, setDropOn] = useState(false);
  useEffect(() => attachScene(host.current), []);
  return (
    <div className={viewClass("3d", max)}>
      <ViewRail title="3D" onMax={onMax}/>
      <div className="phead">
        <div className="phead-start"><h2>3D</h2><WalkButton max={max} onMax={onMax}/></div>
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
        <Caption/>
      </div>
    </div>
  );
}
