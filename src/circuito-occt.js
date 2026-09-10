import "./circuito.css";
import "@google/model-viewer";
import initOpenCascade from "opencascade.js/dist/opencascade.full.js";
import openCascadeWasm from "opencascade.js/dist/opencascade.full.wasm?url";

const viewer = document.querySelector("#viewer");
const status = document.querySelector("#status");
const lampLabel = document.querySelector("#lampLabel");
const powerBadge = document.querySelector("#powerBadge");

const controls = {
  q1: document.querySelector("#toggleQ1"),
  id: document.querySelector("#toggleId"),
  q: document.querySelector("#toggleQ"),
  s: document.querySelector("#toggleS"),
  leak: document.querySelector("#faultLeak"),
  overload: document.querySelector("#faultOverload"),
  reset: document.querySelector("#resetCircuit"),
  front: document.querySelector("#frontView"),
  threeQuarter: document.querySelector("#threeQuarterView"),
  spin: document.querySelector("#spin"),
};

const stateLabels = {
  q1: document.querySelector("#stateQ1"),
  id: document.querySelector("#stateId"),
  q: document.querySelector("#stateQ"),
  s: document.querySelector("#stateS"),
};

let oc = null;
let currentObjectUrl = null;
let spinning = false;
let rebuildToken = 0;

const state = {
  q1On: true,
  idOn: true,
  qOn: true,
  sClosed: false,
};

const C = {
  board: "#E7EBEF",
  boardEdge: "#AAB4BE",
  rail: "#A3ADB7",
  railDark: "#68737F",
  device: "#F4F6F7",
  deviceSide: "#D4DAE0",
  leverOn: "#1476D4",
  leverOff: "#5D6874",
  terminal: "#22272C",
  copper: "#B96B2D",
  phase: "#E21D2A",
  phaseDead: "#6A3035",
  neutral: "#1267D5",
  earth: "#159447",
  earthYellow: "#F2D22E",
  brass: "#B78C35",
  lampOn: "#FFD34E",
  lampOff: "#C9D0D7",
  socket: "#E8E4D9",
  black: "#20262D",
  white: "#FFFFFF",
};

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function rotationMatrix(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}

function transformedUnitShape(shape, center, scale, rotation = [0, 0, 0], centeredSource = true) {
  const r = rotationMatrix(...rotation);
  const linear = Array.from({ length: 3 }, () => Array(3).fill(0));
  const g = new oc.gp_GTrsf_1();

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      linear[row][col] = r[row][col] * scale[col];
      g.SetValue(row + 1, col + 1, linear[row][col]);
    }
  }

  const sourceCenter = centeredSource ? [0, 0, 0] : [0.5, 0.5, 0.5];
  for (let row = 0; row < 3; row++) {
    const offset = linear[row][0] * sourceCenter[0]
      + linear[row][1] * sourceCenter[1]
      + linear[row][2] * sourceCenter[2];
    g.SetValue(row + 1, 4, center[row] - offset);
  }

  g.SetForm();
  return new oc.BRepBuilderAPI_GTransform_2(shape, g, true).Shape();
}

function box(center, size, rotation = [0, 0, 0]) {
  const unit = new oc.BRepPrimAPI_MakeBox_2(1, 1, 1).Shape();
  return transformedUnitShape(unit, center, size, rotation, false);
}

function ellipsoid(center, radii, rotation = [0, 0, 0]) {
  const sphere = new oc.BRepPrimAPI_MakeSphere_1(1).Shape();
  return transformedUnitShape(sphere, center, radii, rotation, true);
}

function makeDir(x, y, z) {
  return new oc.gp_Dir_4(x, y, z);
}

function cylinderBetween(a, b, radius) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const axis = new oc.gp_Ax2_3(
    new oc.gp_Pnt_3(a[0], a[1], a[2]),
    makeDir(dx, dy, dz),
  );
  return new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, length).Shape();
}

function pushPart(parts, name, shape, color) {
  parts.push({ name, shape, color });
}

function pushBox(parts, name, center, size, color, rotation = [0, 0, 0]) {
  pushPart(parts, name, box(center, size, rotation), color);
}

function pushSphere(parts, name, center, radii, color, rotation = [0, 0, 0]) {
  pushPart(parts, name, ellipsoid(center, radii, rotation), color);
}

function pushCylinder(parts, name, a, b, radius, color) {
  pushPart(parts, name, cylinderBetween(a, b, radius), color);
}

function tubePath(parts, name, points, radius, color) {
  for (let i = 0; i < points.length - 1; i++) {
    pushCylinder(parts, `${name}-${i}`, points[i], points[i + 1], radius, color);
  }
  points.slice(1, -1).forEach((point, i) => {
    pushSphere(parts, `${name}-joint-${i}`, point, [radius, radius, radius], color);
  });
}

function addTerminal(parts, name, x, z) {
  pushCylinder(parts, `${name}-hole`, [x, 19.1, z], [x, 22.2, z], 2.6, C.terminal);
  pushCylinder(parts, `${name}-copper`, [x, 22.0, z], [x, 22.8, z], 1.25, C.copper);
}

function addDinRail(parts, name, z, width = 112) {
  pushBox(parts, `${name}-rail`, [0, 1.6, z], [width, 3.2, 6], C.rail);
  pushBox(parts, `${name}-rail-groove`, [0, 3.3, z], [width - 9, 1.0, 1.5], C.railDark);
}

function addTwoPoleDevice(parts, name, z, on, accent = C.leverOn) {
  addDinRail(parts, name, z);
  pushBox(parts, `${name}-body`, [0, 11, z], [64, 16, 34], C.device);
  pushBox(parts, `${name}-side`, [0, 18.8, z], [60, 1.2, 30], C.deviceSide);
  pushBox(parts, `${name}-center-line`, [0, 19.6, z], [1.3, 1.4, 29], C.railDark);

  [-15.5, 15.5].forEach((x, i) => {
    const leverZ = z + (on ? 1.7 : -1.7);
    const tilt = on ? -0.30 : 0.30;
    pushBox(parts, `${name}-lever-${i}`, [x, 22.0, leverZ], [12.5, 5.2, 12.5], on ? accent : C.leverOff, [tilt, 0, 0]);
    addTerminal(parts, `${name}-top-${i}`, x, z + 13.2);
    addTerminal(parts, `${name}-bottom-${i}`, x, z - 13.2);
  });
}

function addSwitch(parts, z, closed) {
  pushBox(parts, "switch-body", [-15.5, 10.5, z], [26, 15, 29], C.device);
  pushBox(parts, "switch-face", [-15.5, 18.4, z], [22, 1.2, 25], C.deviceSide);
  pushBox(
    parts,
    "switch-rocker",
    [-15.5, 21.0, z + (closed ? 1.8 : -1.8)],
    [11, 5, 14],
    closed ? C.leverOn : C.leverOff,
    [closed ? -0.33 : 0.33, 0, 0],
  );
  addTerminal(parts, "switch-top", -15.5, z + 11.5);
  addTerminal(parts, "switch-bottom", -15.5, z - 11.5);
}

function addLamp(parts, lampOn) {
  pushCylinder(parts, "lamp-socket", [0, 10, 34], [0, 10, 45], 7.2, C.socket);
  pushCylinder(parts, "lamp-ring", [0, 10, 33], [0, 10, 36], 8.0, C.deviceSide);
  pushSphere(parts, "lamp-bulb", [0, 10, 20], [12, 8.5, 15], lampOn ? C.lampOn : C.lampOff);
  pushCylinder(parts, "lamp-filament-left", [-2.4, 18.0, 19], [-1.0, 18.0, 25], 0.55, lampOn ? C.copper : C.railDark);
  pushCylinder(parts, "lamp-filament-right", [2.4, 18.0, 19], [1.0, 18.0, 25], 0.55, lampOn ? C.copper : C.railDark);
  pushCylinder(parts, "lamp-filament-bridge", [-1.0, 18.0, 25], [1.0, 18.0, 25], 0.55, lampOn ? C.copper : C.railDark);
}

function addBoard(parts) {
  pushBox(parts, "panel-board", [0, -4.2, 122], [150, 8, 244], C.board);
  pushBox(parts, "panel-left-edge", [-74.3, -0.1, 122], [1.4, 1.4, 242], C.boardEdge);
  pushBox(parts, "panel-right-edge", [74.3, -0.1, 122], [1.4, 1.4, 242], C.boardEdge);

  [
    [-67, 0.4, 10], [67, 0.4, 10], [-67, 0.4, 234], [67, 0.4, 234],
  ].forEach(([x, y, z], i) => {
    pushCylinder(parts, `board-screw-${i}`, [x, y, z], [x, 3.5, z], 3.0, C.railDark);
    pushCylinder(parts, `board-screw-slot-${i}`, [x - 1.8, 3.5, z], [x + 1.8, 3.5, z], 0.45, C.black);
  });
}

function addEarth(parts) {
  const x = 55;
  const y = 22;
  const zTop = 237;
  const zBottom = 216;
  const chunks = 7;
  const dz = (zTop - zBottom) / chunks;
  for (let i = 0; i < chunks; i++) {
    const a = [x, y, zTop - i * dz];
    const b = [x, y, zTop - (i + 1) * dz];
    pushCylinder(parts, `pe-stripe-${i}`, a, b, 2.0, i % 2 === 0 ? C.earth : C.earthYellow);
  }
  pushBox(parts, "pe-terminal", [55, 13.5, 211.5], [16, 10, 10], C.brass);
  pushCylinder(parts, "pe-terminal-hole", [55, 19, 211.5], [55, 22.5, 211.5], 2.4, C.terminal);
  tubePath(parts, "pe-bond", [[55, 22, 207], [55, 22, 195], [67, 22, 195], [67, 22, 184]], 1.8, C.earth);
  pushCylinder(parts, "pe-bond-lug", [67, 20.5, 184], [67, 23.5, 184], 3.2, C.brass);
}

function buildCircuit() {
  const parts = [];
  addBoard(parts);

  const q1z = 196;
  const idz = 148;
  const qz = 100;
  const sz = 57;

  addTwoPoleDevice(parts, "q1", q1z, state.q1On);
  addTwoPoleDevice(parts, "id", idz, state.idOn, "#159E7A");
  addTwoPoleDevice(parts, "q", qz, state.qOn);
  addSwitch(parts, sz, state.sClosed);
  addLamp(parts, isLampOn());
  addEarth(parts);

  const xL = -15.5;
  const xN = 15.5;
  const y = 22.8;
  const r = 1.85;

  const afterQ1 = state.q1On;
  const afterId = afterQ1 && state.idOn;
  const afterQ = afterId && state.qOn;
  const afterS = afterQ && state.sClosed;

  tubePath(parts, "L-in", [[xL, y, 237], [xL, y, 209.2]], r, C.phase);
  tubePath(parts, "L-q1-id", [[xL, y, 182.8], [xL, y, 161.2]], r, afterQ1 ? C.phase : C.phaseDead);
  tubePath(parts, "L-id-q", [[xL, y, 134.8], [xL, y, 113.2]], r, afterId ? C.phase : C.phaseDead);
  tubePath(parts, "L-q-s", [[xL, y, 86.8], [xL, y, 68.5]], r, afterQ ? C.phase : C.phaseDead);
  tubePath(parts, "L-s-lamp", [[xL, y, 45.5], [xL, y, 39], [0, y, 39], [0, y, 34]], r, afterS ? C.phase : C.phaseDead);

  tubePath(parts, "N-in", [[xN, y, 237], [xN, y, 209.2]], r, C.neutral);
  tubePath(parts, "N-q1-id", [[xN, y, 182.8], [xN, y, 161.2]], r, C.neutral);
  tubePath(parts, "N-id-q", [[xN, y, 134.8], [xN, y, 113.2]], r, C.neutral);
  tubePath(parts, "N-q-lamp", [[xN, y, 86.8], [xN, y, 31], [5.5, y, 31]], r, C.neutral);

  pushSphere(parts, "L-feed-cap", [xL, y, 239], [3.0, 3.0, 3.0], C.phase);
  pushSphere(parts, "N-feed-cap", [xN, y, 239], [3.0, 3.0, 3.0], C.neutral);
  pushSphere(parts, "PE-feed-cap", [55, y, 239], [3.0, 3.0, 3.0], C.earth);

  return parts;
}

function addPart(doc, part, index) {
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  const label = shapeTool.NewShape();
  shapeTool.SetShape(label, part.shape);
  new oc.BRepMesh_IncrementalMesh_2(part.shape, 0.55, false, 0.28, false);

  const materialTool = oc.XCAFDoc_DocumentTool.VisMaterialTool(label).get();
  const material = new oc.XCAFDoc_VisMaterial();
  const materialLabel = materialTool.AddMaterial_1(
    new oc.Handle_XCAFDoc_VisMaterial_2(material),
    new oc.TCollection_AsciiString_2(`${part.name}-${index}`),
  );
  materialTool.SetShapeMaterial_1(label, materialLabel);

  const [red, green, blue] = hexToRgb(part.color);
  const pbr = new oc.XCAFDoc_VisMaterialPBR();
  pbr.BaseColor = new oc.Quantity_ColorRGBA_5(red, green, blue, 1);
  material.SetPbrMaterial(pbr);
}

function exportParts(parts) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  parts.forEach((part, index) => addPart(doc, part, index));

  const path = `/circuito-${Date.now()}.glb`;
  const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(path), true);
  const ok = writer.Perform_2(
    new oc.Handle_TDocStd_Document_2(doc),
    new oc.TColStd_IndexedDataMapOfStringString_1(),
    new oc.Message_ProgressRange_1(),
  );
  if (!ok) throw new Error("OCCT no pudo exportar el circuito a GLB.");

  const glb = oc.FS.readFile(path, { encoding: "binary" });
  oc.FS.unlink(path);
  return URL.createObjectURL(new Blob([glb.buffer], { type: "model/gltf-binary" }));
}

function isLampOn() {
  return state.q1On && state.idOn && state.qOn && state.sClosed;
}

function updateUi() {
  stateLabels.q1.textContent = state.q1On ? "ON" : "OFF";
  stateLabels.id.textContent = state.idOn ? "ON" : "DISPARADO";
  stateLabels.q.textContent = state.qOn ? "ON" : "DISPARADO";
  stateLabels.s.textContent = state.sClosed ? "CERRADO" : "ABIERTO";

  controls.q1.classList.toggle("is-off", !state.q1On);
  controls.id.classList.toggle("is-off", !state.idOn);
  controls.q.classList.toggle("is-off", !state.qOn);
  controls.s.classList.toggle("is-off", !state.sClosed);

  const lampOn = isLampOn();
  lampLabel.textContent = lampOn ? "Bombilla encendida" : "Bombilla apagada";
  powerBadge.textContent = lampOn ? "CIRCUITO CERRADO" : "SIN CARGA";
  powerBadge.classList.toggle("on", lampOn);
  powerBadge.classList.toggle("off", !lampOn);
}

function setBusy(busy) {
  [controls.q1, controls.id, controls.q, controls.s, controls.leak, controls.overload, controls.reset]
    .forEach((button) => { button.disabled = busy; });
}

async function rebuild(message = "Regenerando circuito") {
  if (!oc) return;
  const token = ++rebuildToken;
  setBusy(true);
  updateUi();
  status.textContent = `${message} · construyendo sólidos B-Rep…`;

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const parts = buildCircuit();
    status.textContent = `Mallando ${parts.length} piezas CAD y exportando GLB…`;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const nextUrl = exportParts(parts);
    if (token !== rebuildToken) {
      URL.revokeObjectURL(nextUrl);
      return;
    }

    viewer.src = nextUrl;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = nextUrl;
    status.textContent = `Listo · ${parts.length} piezas CAD · OCCT → GLB → model-viewer`;
  } catch (error) {
    console.error(error);
    status.textContent = `Error de OCCT: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (token === rebuildToken) setBusy(false);
  }
}

controls.q1.addEventListener("click", () => {
  state.q1On = !state.q1On;
  rebuild(state.q1On ? "Q1 conectado" : "Q1 abierto");
});

controls.id.addEventListener("click", () => {
  state.idOn = !state.idOn;
  rebuild(state.idOn ? "Diferencial rearmado" : "Diferencial abierto");
});

controls.q.addEventListener("click", () => {
  state.qOn = !state.qOn;
  rebuild(state.qOn ? "Automático rearmado" : "Automático abierto");
});

controls.s.addEventListener("click", () => {
  state.sClosed = !state.sClosed;
  rebuild(state.sClosed ? "S cerrado: comprobando alimentación de H" : "S abierto: fase interrumpida");
});

controls.leak.addEventListener("click", () => {
  state.idOn = false;
  state.sClosed = false;
  rebuild("Fuga simulada: el diferencial ID dispara");
});

controls.overload.addEventListener("click", () => {
  state.qOn = false;
  state.sClosed = false;
  rebuild("Sobrecarga simulada: el magnetotérmico Q dispara");
});

controls.reset.addEventListener("click", () => {
  state.q1On = true;
  state.idOn = true;
  state.qOn = true;
  state.sClosed = false;
  rebuild("Circuito restablecido; S queda abierto");
});

controls.front.addEventListener("click", () => {
  viewer.cameraOrbit = "0deg 80deg 150%";
  viewer.jumpCameraToGoal?.();
});

controls.threeQuarter.addEventListener("click", () => {
  viewer.cameraOrbit = "-28deg 73deg 160%";
  viewer.jumpCameraToGoal?.();
});

controls.spin.addEventListener("click", () => {
  spinning = !spinning;
  viewer.toggleAttribute("auto-rotate", spinning);
  viewer.autoRotateDelay = 0;
  viewer.rotationPerSecond = "16deg";
  controls.spin.textContent = spinning ? "⏸ Pausar giro" : "▶ Girar";
});

async function boot() {
  updateUi();
  setBusy(true);
  try {
    status.textContent = "Cargando OpenCascade.js / WebAssembly…";
    oc = await initOpenCascade({
      locateFile: (path) => (path.endsWith(".wasm") ? openCascadeWasm : path),
    });
    await rebuild("OCCT listo");
  } catch (error) {
    console.error(error);
    status.textContent = `No se pudo iniciar OpenCascade.js: ${error instanceof Error ? error.message : String(error)}`;
  }
}

boot();
