import "./style.css";
import "@google/model-viewer";
import initOpenCascade from "opencascade.js/dist/opencascade.full.js";
import openCascadeWasm from "opencascade.js/dist/opencascade.full.wasm?url";

const viewer = document.querySelector("#viewer");
const status = document.querySelector("#status");
const rebuildButton = document.querySelector("#rebuild");
const spinButton = document.querySelector("#spin");
const frontButton = document.querySelector("#frontView");
const threeQuarterButton = document.querySelector("#threeQuarterView");

let oc = null;
let currentObjectUrl = null;
let spinning = true;

const palette = {
  skin: "#5F8F27",
  skinDark: "#3E6D22",
  rim: "#8FCB38",
  flesh: "#EAF27B",
  fleshLight: "#FFF6A7",
  pit: "#A96020",
  pitDark: "#6F3413",
  cheek: "#F58B79",
  black: "#1B120A",
  white: "#FFF9E9",
  hat: "#F5D796",
  hatBand: "#C77B46",
  leaf: "#8DBD2A",
  leafDark: "#527E1C",
  tongue: "#F08070",
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

function ellipsoid(center, radii, rotation = [0, 0, 0]) {
  const sphere = new oc.BRepPrimAPI_MakeSphere_1(1).Shape();
  const r = rotationMatrix(...rotation);
  const g = new oc.gp_GTrsf_1();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      g.SetValue(row + 1, col + 1, r[row][col] * radii[col]);
    }
  }
  g.SetValue(1, 4, center[0]);
  g.SetValue(2, 4, center[1]);
  g.SetValue(3, 4, center[2]);
  g.SetForm();
  return new oc.BRepBuilderAPI_GTransform_2(sphere, g, true).Shape();
}

function makeDir(x, y, z) {
  return new oc.gp_Dir_4(x, y, z);
}

function cylinderBetween(a, b, radius) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const axis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(a[0], a[1], a[2]), makeDir(dx, dy, dz));
  return new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, length).Shape();
}

function capsule(parts, name, a, b, radius, color) {
  parts.push({ name: `${name}-shaft`, shape: cylinderBetween(a, b, radius), color });
  parts.push({ name: `${name}-a`, shape: ellipsoid(a, [radius, radius, radius]), color });
  parts.push({ name: `${name}-b`, shape: ellipsoid(b, [radius, radius, radius]), color });
}

function addPart(doc, part, index) {
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  const label = shapeTool.NewShape();
  shapeTool.SetShape(label, part.shape);
  new oc.BRepMesh_IncrementalMesh_2(part.shape, 0.42, false, 0.22, false);

  const materialTool = oc.XCAFDoc_DocumentTool.VisMaterialTool(label).get();
  const material = new oc.XCAFDoc_VisMaterial();
  const materialLabel = materialTool.AddMaterial_1(
    new oc.Handle_XCAFDoc_VisMaterial_2(material),
    new oc.TCollection_AsciiString_2(`${part.name}-${index}`),
  );
  materialTool.SetShapeMaterial_1(label, materialLabel);

  const [r, g, b] = hexToRgb(part.color);
  const pbr = new oc.XCAFDoc_VisMaterialPBR();
  pbr.BaseColor = new oc.Quantity_ColorRGBA_5(r, g, b, 1);
  material.SetPbrMaterial(pbr);
}

function buildAuralis() {
  const parts = [];

  // Silueta de pera: más redonda abajo y estrecha arriba, como la referencia de Auralis Compra.
  parts.push({ name: "body-base", shape: ellipsoid([0, 0, 54], [38, 20, 44]), color: palette.skinDark });
  parts.push({ name: "body-mid", shape: ellipsoid([0, 0, 83], [31, 18, 37]), color: palette.skin });
  parts.push({ name: "body-top", shape: ellipsoid([0, 0, 108], [22, 15, 25]), color: palette.skin });
  parts.push({ name: "body-crown", shape: ellipsoid([0, 0, 119], [14, 12, 13]), color: palette.skin });

  // Dos capas frontales crean el borde verde y la pulpa amarilla/crema del personaje.
  parts.push({ name: "flesh-rim-low", shape: ellipsoid([0, 18.0, 58], [31, 4.9, 36]), color: palette.rim });
  parts.push({ name: "flesh-rim-high", shape: ellipsoid([0, 17.3, 88], [24, 4.6, 29]), color: palette.rim });
  parts.push({ name: "flesh-low", shape: ellipsoid([0, 22.0, 60], [27.8, 4.0, 32]), color: palette.flesh });
  parts.push({ name: "flesh-high", shape: ellipsoid([0, 21.2, 89], [20.5, 3.6, 24.5]), color: palette.fleshLight });

  // Hueso grande y brillante.
  parts.push({ name: "pit-shadow", shape: ellipsoid([0, 24.0, 52], [18.0, 8.8, 19.0]), color: palette.pitDark });
  parts.push({ name: "pit", shape: ellipsoid([0, 27.0, 54], [16.4, 7.6, 17.2]), color: palette.pit });
  parts.push({ name: "pit-glint-big", shape: ellipsoid([-5.4, 34.2, 62.0], [3.4, 1.05, 4.7], [0, 0, -0.40]), color: palette.white });
  parts.push({ name: "pit-glint-small", shape: ellipsoid([-1.6, 34.4, 67.0], [1.3, 0.75, 1.8]), color: palette.white });

  // Cara: ojo izquierdo abierto y ojo derecho guiñado, como en la portada que has enseñado.
  parts.push({ name: "eye-open", shape: ellipsoid([-11.5, 26.0, 91.5], [4.1, 2.0, 6.3]), color: palette.black });
  parts.push({ name: "eye-open-glint", shape: ellipsoid([-12.5, 28.1, 94.0], [1.15, 0.62, 1.65]), color: palette.white });
  capsule(parts, "wink-a", [8.0, 27.0, 92.4], [12.5, 27.2, 95.0], 1.35, palette.black);
  capsule(parts, "wink-b", [12.5, 27.2, 95.0], [17.5, 27.0, 92.0], 1.35, palette.black);

  parts.push({ name: "cheek-left", shape: ellipsoid([-21.0, 24.8, 81.0], [5.0, 1.7, 3.7]), color: palette.cheek });
  parts.push({ name: "cheek-right", shape: ellipsoid([20.5, 24.8, 80.5], [5.0, 1.7, 3.7]), color: palette.cheek });
  parts.push({ name: "mouth", shape: ellipsoid([0, 26.2, 82.0], [5.8, 2.0, 4.3]), color: palette.black });
  parts.push({ name: "tongue", shape: ellipsoid([0.4, 28.1, 80.7], [2.8, 0.8, 1.9]), color: palette.tongue });

  // Brazo izquierdo levantado en saludo; derecho relajado.
  capsule(parts, "arm-left-1", [-31, 2, 75], [-42, 6, 84], 4.4, palette.skin);
  capsule(parts, "arm-left-2", [-42, 6, 84], [-40, 8, 94], 4.1, palette.skin);
  parts.push({ name: "hand-left", shape: ellipsoid([-40, 9, 96], [6.1, 4.0, 5.0], [0, 0, 0.25]), color: palette.rim });
  capsule(parts, "arm-right", [31, 1, 68], [39, 5, 58], 4.6, palette.skin);
  parts.push({ name: "hand-right", shape: ellipsoid([40, 6, 56], [5.3, 4.0, 5.6]), color: palette.rim });

  // Pies cortos y anchos.
  parts.push({ name: "foot-left", shape: ellipsoid([-16, 1, 12], [10.5, 11, 5.2], [0, 0.10, -0.13]), color: palette.rim });
  parts.push({ name: "foot-right", shape: ellipsoid([16, 1, 12], [10.5, 11, 5.2], [0, -0.10, 0.13]), color: palette.rim });

  // Pequeñas motas de piel para romper el aspecto demasiado perfecto.
  [
    [-31, 13, 42, 1.5], [-33, 12, 59, 1.3], [-29, 14, 76, 1.6],
    [31, 13, 47, 1.4], [33, 12, 64, 1.7], [29, 14, 84, 1.4],
    [-25, 15, 101, 1.1], [24, 15, 104, 1.2],
  ].forEach(([x, y, z, s], i) => {
    parts.push({ name: `freckle-${i}`, shape: ellipsoid([x, y, z], [s, 0.9, s]), color: palette.skinDark });
  });

  // Sombrero de hojas con borde ondulado aproximado mediante B-Reps superpuestos.
  parts.push({ name: "hat-top", shape: ellipsoid([0, 0.5, 124.0], [25, 15, 5.6]), color: palette.hat });
  parts.push({ name: "hat-band", shape: ellipsoid([0, 3.0, 121.2], [24, 13.0, 2.5]), color: palette.hatBand });
  parts.push({ name: "hat-brim-core", shape: ellipsoid([0, 0, 117.3], [35, 20, 4.2]), color: palette.hat });
  [
    [-31, 0, 116.0, 8, 8, 4.8], [31, 0, 116.0, 8, 8, 4.8],
    [-25, 13, 115.5, 9, 6, 4.4], [25, 13, 115.5, 9, 6, 4.4],
    [-25, -13, 115.5, 9, 6, 4.4], [25, -13, 115.5, 9, 6, 4.4],
    [-10, 18, 115.2, 11, 5, 4.2], [10, 18, 115.2, 11, 5, 4.2],
    [-10, -18, 115.2, 11, 5, 4.2], [10, -18, 115.2, 11, 5, 4.2],
  ].forEach(([x, y, z, sx, sy, sz], i) => {
    parts.push({ name: `hat-wave-${i}`, shape: ellipsoid([x, y, z], [sx, sy, sz]), color: palette.hat });
  });

  // Tallo rizado.
  capsule(parts, "stem-1", [0, 0, 128], [-3, 0, 140], 3.2, palette.pitDark);
  capsule(parts, "stem-2", [-3, 0, 140], [4, 0, 145], 3.0, palette.pitDark);
  capsule(parts, "stem-3", [4, 0, 145], [10, 0, 141], 2.8, palette.pitDark);
  parts.push({ name: "stem-tip", shape: ellipsoid([10.5, 0, 140], [3.1, 3.1, 3.1]), color: palette.pitDark });

  // Hoja tridimensional y nervaduras.
  parts.push({ name: "leaf", shape: ellipsoid([19, 0.4, 139], [15, 3.0, 7.7], [0, -0.44, 0]), color: palette.leaf });
  capsule(parts, "leaf-main-vein", [7, 3.2, 134.8], [29, 3.2, 143.0], 0.72, palette.leafDark);
  capsule(parts, "leaf-vein-a", [15, 3.0, 138], [18, 3.0, 145], 0.42, palette.leafDark);
  capsule(parts, "leaf-vein-b", [19, 3.0, 140], [24, 3.0, 135], 0.42, palette.leafDark);
  capsule(parts, "leaf-vein-c", [22, 3.0, 141], [27, 3.0, 146], 0.38, palette.leafDark);

  return parts;
}

function exportParts(parts) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  parts.forEach((part, index) => addPart(doc, part, index));

  const path = `/auralis-${Date.now()}.glb`;
  const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(path), true);
  const ok = writer.Perform_2(
    new oc.Handle_TDocStd_Document_2(doc),
    new oc.TColStd_IndexedDataMapOfStringString_1(),
    new oc.Message_ProgressRange_1(),
  );
  if (!ok) throw new Error("OCCT no pudo exportar Auralis a GLB.");

  const glb = oc.FS.readFile(path, { encoding: "binary" });
  oc.FS.unlink(path);
  return URL.createObjectURL(new Blob([glb.buffer], { type: "model/gltf-binary" }));
}

async function rebuild() {
  if (!oc) return;
  rebuildButton.disabled = true;
  status.textContent = "Construyendo Auralis con sólidos B-Rep de OCCT…";

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const parts = buildAuralis();
    status.textContent = `Mallando y aplicando materiales PBR a ${parts.length} piezas…`;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const nextUrl = exportParts(parts);
    viewer.src = nextUrl;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = nextUrl;
    status.textContent = `Listo · Auralis OCCT · ${parts.length} piezas B-Rep → GLB`;
  } catch (error) {
    console.error(error);
    status.textContent = `Error de OCCT: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    rebuildButton.disabled = false;
  }
}

rebuildButton.addEventListener("click", rebuild);
spinButton.addEventListener("click", () => {
  spinning = !spinning;
  viewer.toggleAttribute("auto-rotate", spinning);
  spinButton.textContent = spinning ? "⏸ Pausar giro" : "▶ Girar";
});
frontButton.addEventListener("click", () => {
  viewer.cameraOrbit = "0deg 78deg 165%";
  viewer.jumpCameraToGoal?.();
});
threeQuarterButton.addEventListener("click", () => {
  viewer.cameraOrbit = "-30deg 72deg 170%";
  viewer.jumpCameraToGoal?.();
});

async function boot() {
  try {
    status.textContent = "Cargando OpenCascade.js / WebAssembly…";
    oc = await initOpenCascade({
      locateFile: (path) => (path.endsWith(".wasm") ? openCascadeWasm : path),
    });
    rebuildButton.disabled = false;
    rebuildButton.textContent = "↻ Regenerar Auralis";
    await rebuild();
  } catch (error) {
    console.error(error);
    status.textContent = `No se pudo iniciar OCCT: ${error instanceof Error ? error.message : String(error)}`;
  }
}

boot();
