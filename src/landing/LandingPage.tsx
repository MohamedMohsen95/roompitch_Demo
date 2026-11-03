// The landing page (/): the template room drawn in line, the plan beside the room, one library piece at a
// time, the estimate building itself, and the stages from tape to proposal. Signing in and up happen in the
// studio's account dialog (/studio?auth=signin|signup|account); this page only shows who is signed in.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { mountRoom, mountPiece } from "./room3d.js";
import { useAccount } from "../studio/ui/account";
import css from "./landing.css?inline";

const PIECES = [
  {name:"Sofa", w:2.73, d:0.92, h:1.12, price:6000, model:"/models/sofa_03/sofa_03_2k.glb"},
  {name:"Rocking chair", w:0.71, d:0.83, h:0.99, price:12000, model:"/models/Rockingchair_01/Rockingchair_01_2k.glb"},
  {name:"Round table", w:1.4, d:1.4, h:1.01, price:9000, model:"/models/round_wooden_table_01/round_wooden_table_01_2k.glb"},
  {name:"Wooden cabinet", w:2.44, d:0.52, h:0.68, price:11500, model:"/models/modern_wooden_cabinet/modern_wooden_cabinet_2k.glb"},
  {name:"Ottoman", w:0.88, d:0.62, h:0.62, price:7500, model:"/models/Ottoman_01/Ottoman_01_2k.glb"},
  {name:"Potted plant", w:0.59, d:0.63, h:1.34, price:10500, model:"/models/potted_plant_01/potted_plant_01_2k.glb"},
];

// The living room template's estimate, as the studio wrote it (EGP).
const LEDGER: [string, string, number][] = [
  ["Floor: herringbone parquet", "45 m² × 1,500", 67500],
  ["Walls: marble wall tiles", "10.5 m² × 2,400", 25152],
  ["Walls: textured white plaster", "25.2 m² × 320", 8064],
  ["Walls: smooth plaster", "21.8 m² × 250", 5460],
  ["Sofa", "1 pc", 6000],
  ["Rocking chair", "1 pc", 12000],
  ["Wooden cabinet", "1 pc", 11500],
  ["Potted plant", "1 pc", 10500],
  ["Shag rug", "1 pc", 9500],
  ["TV unit", "1 pc", 9000],
  ["Round table", "1 pc", 9000],
  ["Ottoman", "1 pc", 7500],
  ["Dining chairs and vase", "5 pc", 55500],
];
const TOTAL = LEDGER.reduce((s, l) => s + l[2], 0);

const STAGES = [["Measure", "Walls, height, openings."], ["Furnish", "Drag pieces into plan or 3D."], ["Price", "Your list, your fee, VAT."],
  ["Render", "A photoreal view you chose."], ["Propose", "A PDF with your logo."]];

const fmt = (n: number) => n.toLocaleString("en");
const cm = (m: number) => Math.round(m * 100);
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Calls fn once, the first time el is at least `share` on screen.
function onceSeen(el: Element, share: number, fn: () => void){
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting){ io.disconnect(); fn(); } }, {threshold:share});
  io.observe(el);
  return () => io.disconnect();
}

function Hero(){
  const room = useRef<HTMLDivElement>(null);
  useEffect(() => mountRoom(room.current!), []);
  const account = useAccount();
  return (
    <section className="hero container" aria-labelledby="hero-title">
      <div className="hero-text">
        <h1 id="hero-title"><span>Measure it.</span> <span>Furnish it.</span> <span>Price it.</span></h1>
        <p className="lead">The room your client signs, drawn in 3D from your tape measure.</p>
        <div className="actions">
          <Link className="btn btn--primary" to="/studio">Start a room</Link>
          {account?.email
            ? <Link className="btn" to="/studio">Your projects</Link>
            : <Link className="btn" to="/studio?auth=signin">Sign in or sign up</Link>}
        </div>
      </div>
      <figure className="drawing">
        <div className="grid fig" id="room" ref={room}>
          <img className="room-still" src="/landing/room-still.webp" alt="The living room as a line drawing: a 900 by 500 centimetre room with a sofa, rocking chair, dining table and four chairs."/>
        </div>
        <div className="dim dim--x" aria-hidden="true"><span className="num">900 cm</span></div>
        <figcaption><span className="num">D-01</span> Living room, 900 × 500 × 280 cm, 13 pieces. Drag to turn it.</figcaption>
      </figure>
    </section>
  );
}

// The library: the drawing cycles through the pieces every 4 s until one is picked.
function Pieces(){
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof mountPiece> | null>(null);
  const [at, setAt] = useState(0);
  const [auto, setAuto] = useState(() => !still());
  useEffect(() => { viewer.current = mountPiece(host.current!); return () => { viewer.current!.dispose(); viewer.current = null; }; }, []);
  useEffect(() => { viewer.current?.show(PIECES[at]).catch((e: Error) => console.warn("[piece]", e)); }, [at]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setAt(i => (i + 1) % PIECES.length), 4000);
    return () => clearInterval(id);
  }, [auto]);
  const p = PIECES[at];
  return (
    <section className="pieces container" aria-labelledby="pieces-title">
      <div className="pieces-text">
        <h2 id="pieces-title">Real pieces, real sizes</h2>
        <p>Every piece in the library is a real model, scaled to the centimetre before it reaches the plan.</p>
        <ul className="picker" aria-label="Pieces from the library">
          {PIECES.map((x, i) => (
            <li key={x.name}><button type="button" aria-pressed={i === at} onClick={() => { setAuto(false); setAt(i); }}>{x.name}</button></li>
          ))}
        </ul>
      </div>
      <figure className="pieces-fig">
        <div className="grid fig" id="piece" ref={host}/>
        <figcaption className="readout" aria-live="polite">
          <span className="readout-name">{p.name}</span>
          <span className="num">{cm(p.w)} × {cm(p.d)} × {cm(p.h)} cm</span>
          <span className="num">EGP {fmt(p.price)}</span>
        </figcaption>
      </figure>
    </section>
  );
}

// The estimate: lines arrive one by one and the total counts up with them, once, when it comes into view.
function Priced(){
  const ledger = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(LEDGER.length);
  const [total, setTotal] = useState(TOTAL);
  const [run, setRun] = useState(0);
  const motion = !still();
  useEffect(() => motion ? onceSeen(ledger.current!, 0.4, () => setRun(1)) : undefined, [motion]);
  useEffect(() => {
    if (!run) return;
    const timers: number[] = [];
    let raf = 0, sum = 0;
    setShown(0); setTotal(0);
    LEDGER.forEach((l, i) => timers.push(window.setTimeout(() => {
      setShown(i + 1);
      const from = sum, to = (sum += l[2]), t0 = performance.now();
      const tick = (t: number) => { const k = Math.min(1, (t - t0) / 260); setTotal(Math.round(from + (to - from) * k)); if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }, 180 + i * 220)));
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [run]);
  return (
    <section className="priced container" aria-labelledby="priced-title">
      <div className="priced-text">
        <h2 id="priced-title">Priced as you place</h2>
        <p>Finishes are measured off the walls and pieces counted as they go in, all at your own prices.</p>
        {motion && <button className="btn replay" type="button" onClick={() => setRun(r => r + 1)}>Build it again</button>}
      </div>
      <div className={"ledger fig" + (run ? " building" : "")} ref={ledger}>
        <div className="ledger-head"><span>Estimate, living room</span><span className="num">EGP</span></div>
        <ol className="ledger-lines">
          {LEDGER.map(([name, q, v], i) => (
            <li key={name} className={i < shown ? "in" : undefined}><span>{name}</span><span className="num q">{q}</span><span className="num v">{fmt(v)}</span></li>
          ))}
        </ol>
        <div className="ledger-total"><span>Total</span><span className="num">{fmt(total)}</span></div>
      </div>
    </section>
  );
}

// The stages: a light runs along the string once, thickening the line behind it, and each stage blinks and
// lights up as the light reaches it. Wide screens only: on a phone the stages stack and have no string.
function Stages(){
  const list = useRef<HTMLOListElement>(null), dot = useRef<HTMLSpanElement>(null), trail = useRef<HTMLSpanElement>(null);
  const [armed] = useState(() => !still() && matchMedia("(min-width: 60.01rem)").matches);
  const [hit, setHit] = useState(-1), [done, setDone] = useState(-1);
  useEffect(() => {
    if (!armed) return;
    const RUN = 5200, timers: number[] = [];
    const stop = onceSeen(list.current!, 0.6, () => {
      const W = list.current!.clientWidth, x = (px: number) => `translateX(${px}px)`;
      dot.current!.animate([{opacity:1, transform:x(0)}, {opacity:1, transform:x(W), offset:0.97}, {opacity:0, transform:x(W)}], {duration:RUN, easing:"linear", fill:"forwards"});
      trail.current!.animate([{transform:"scaleX(0)"}, {transform:"scaleX(1)", offset:0.97}, {transform:"scaleX(1)"}], {duration:RUN, easing:"linear", fill:"forwards"});
      [...list.current!.children].forEach((li, i) => timers.push(window.setTimeout(() => {
        setHit(i); setDone(i);
        timers.push(window.setTimeout(() => setHit(h => h === i ? -1 : h), 800));
      }, (li as HTMLElement).offsetLeft / W * RUN)));
    });
    return () => { stop(); timers.forEach(clearTimeout); };
  }, [armed]);
  return (
    <section className="run container" aria-labelledby="run-title">
      <h2 id="run-title">From tape to proposal</h2>
      <ol className={"stages" + (armed ? " armed" : "")} ref={list}>
        {STAGES.map(([h, p], i) => (
          <li key={h} className={[i === hit && "hit", i <= done && "done"].filter(Boolean).join(" ") || undefined}><h3>{h}</h3><p>{p}</p></li>
        ))}
        {armed && <><span className="stages-trail" aria-hidden="true" ref={trail}/><span className="stages-light" aria-hidden="true" ref={dot}/></>}
      </ol>
    </section>
  );
}

export default function LandingPage(){
  const account = useAccount();
  useEffect(() => { document.title = "RoomPitch: measure it, furnish it, price it"; }, []);
  return (
    <div className="js">
      <style>{css}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600&display=swap" precedence="default"/>
      <header className="nav">
        <Link className="mark" to="/">RoomPitch</Link>
        <nav aria-label="Main"><a href="#contact">Contact</a></nav>
        <div className="nav-account">
          {account?.email ? <>
            <Link className="nav-link" to="/studio?auth=account" title="Account">{account.email}</Link>
            <Link className="btn btn--primary btn--small" to="/studio">Open the studio</Link>
          </> : <>
            <Link className="nav-link" to="/studio?auth=signin">Sign in</Link>
            <Link className="btn btn--primary btn--small" to="/studio?auth=signup">Sign up</Link>
          </>}
        </div>
      </header>

      <main>
        <Hero/>
        <section className="pair container" aria-labelledby="pair-title">
          <h2 id="pair-title">From the plan to the room</h2>
          <div className="pair-grid">
            <figure className="cell">
              <div className="fig cyan"><div className="shot shot--plan" role="img" aria-label="The floor plan of the living room."/></div>
              <figcaption><span className="num">D-02</span>The plan, typed in centimetres or read from photos.</figcaption>
            </figure>
            <figure className="cell">
              <div className="fig cyan"><div className="shot shot--room" role="img" aria-label="The same living room in the 3D view."/></div>
              <figcaption><span className="num">D-03</span>The same room in 3D, to walk through at eye height.</figcaption>
            </figure>
          </div>
        </section>
        <Pieces/>
        <Priced/>
        <Stages/>
      </main>

      <footer className="foot container" id="contact">
        <div><p className="mark">RoomPitch</p><p>For interior designers.</p></div>
        <nav aria-label="Studio"><h2>Studio</h2><Link to="/studio">Start a room</Link><Link to="/studio?auth=signin">Sign in</Link><Link to="/studio?auth=signup">Sign up</Link></nav>
        <div><h2>Contact</h2><address><a href="mailto:hello@roompitch.example">hello@roompitch.example</a><a href="tel:+201000000000" className="num">+20 100 000 0000</a><span>Cairo, Egypt</span></address></div>
        <div><h2>Credits</h2><p>Furniture models from Poly Haven, CC0.</p></div>
      </footer>
    </div>
  );
}
