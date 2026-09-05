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
  skinDark: "#3E7D2F",
  flesh: "#CDEB6B",
  fleshLight: "#FFF8B0",
  cream: "#F9D7C0",
  pit: "#8B5A2B",
  cheek: "#FF9AA2",
  black: "#16120F",
  white: "#FFFDF4",
  leaf: "#78B82A",
  leafDark: "#477B20",
  tongue: "#F06F78",
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
  const g = new oc.gp_GTrsf();

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
  const dir = new oc.gp_Dir();
  dir.SetCoord_2(x, y, z);
  return dir;
}

function cylinderBetween(a, b, radius) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const axis = new oc.gp_Ax2();
  axis.SetLocation(new oc.gp_Pnt_3(a[0], a[1], a[2]));
  axis.SetDirection(makeDir(dx, dy, dz));
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
  new oc.BRepMesh_IncrementalMesh_2(part.shape, 0.65, false, 0.32, false);

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

function buildCharacter() {
  const parts = [];

  // Avocado silhouette: three overlapping B-Rep ellipsoids make the pear shape.
  parts.push({ name: "body-lower", shape: ellipsoid([0, 0, 55], [35, 18, 43]), color: palette.skinDark });
  parts.push({ name: "body-upper", shape: ellipsoid([0, 0, 88], [26, 16, 31]), color: palette.skinDark });
  parts.push({ name: "body-crown", shape: ellipsoid([0, 0, 108], [16, 13, 18]), color: palette.skinDark });

  // Raised inner flesh layer.
  parts.push({ name: "flesh-lower", shape: ellipsoid([0, 16.8, 56], [28, 5.2, 35]), color: palette.flesh });
  parts.push({ name: "flesh-upper", shape: ellipsoid([0, 15.8, 86], [21.5, 4.8, 25]), color: palette.fleshLight });

  // Pit and glossy highlight.
  parts.push({ name: "pit", shape: ellipsoid([0, 23.5, 53], [15.5, 7.8, 17]), color: palette.pit });
  parts.push({ name: "pit-highlight", shape: ellipsoid([-5.2, 30.7, 61], [3.2, 1.2, 4.4], [0, 0, -0.45]), color: palette.cream });

  // Kawaii face.
  parts.push({ name: "eye-left", shape: ellipsoid([-10.5, 21.8, 88], [3.4, 2.2, 5.2]), color: palette.black });
  parts.push({ name: "eye-right", shape: ellipsoid([10.5, 21.8, 88], [3.4, 2.2, 5.2]), color: palette.black });
  parts.push({ name: "eye-left-glint", shape: ellipsoid([-11.4, 24.0, 90.2], [1.0, 0.7, 1.4]), color: palette.white });
  parts.push({ name: "eye-right-glint", shape: ellipsoid([9.6, 24.0, 90.2], [1.0, 0.7, 1.4]), color: palette.white });
  parts.push({ name: "cheek-left", shape: ellipsoid([-19.2, 20.8, 78.8], [4.7, 2.1, 3.2]), color: palette.cheek });
  parts.push({ name: "cheek-right", shape: ellipsoid([19.2, 20.8, 78.8], [4.7, 2.1, 3.2]), color: palette.cheek });
  parts.push({ name: "mouth", shape: ellipsoid([0, 22.4, 78.2], [5.2, 2.0, 3.7]), color: palette.black });
  parts.push({ name: "tongue", shape: ellipsoid([0, 24.1, 76.8], [2.7, 0.9, 1.8]), color: palette.tongue });

  // Arms and feet.
  capsule(parts, "arm-left", [-29, 1, 68], [-42, 5, 73], 4.1, palette.skinDark);
  capsule(parts, "arm-right", [29, 1, 68], [42, 5, 73], 4.1, palette.skinDark);
  parts.push({ name: "foot-left", shape: ellipsoid([-16, 1, 13], [9, 10, 4.8], [0, 0.10, -0.10]), color: palette.skinDark });
  parts.push({ name: "foot-right", shape: ellipsoid([16, 1, 13], [9, 10, 4.8], [0, -0.10, 0.10]), color: palette.skinDark });

  // Skin freckles.
  [
    [-29, 12, 44, 1.7], [-31, 10, 61, 1.3], [-27, 13, 82, 1.5],
    [29, 12, 48, 1.4], [31, 10, 65, 1.8], [27, 13, 89, 1.3],
    [-22, 14, 102, 1.1], [22, 14, 103, 1.1],
  ].forEach(([x, y, z, s], i) => {
    parts.push({ name: `freckle-${i}`, shape: ellipsoid([x, y, z], [s, 1.0, s]), color: palette.leafDark });
  });

  // Leaf hat and its scalloped brim.
  parts.push({ name: "hat-brim", shape: ellipsoid([0, 0, 116.2], [34, 19.5, 4.3]), color: palette.cream });
  parts.push({ name: "hat-crown", shape: ellipsoid([0, 0.2, 119.6], [26, 15.3, 5.0]), color: "#FFD9AF" });
  [
    [-28, 0, 114.8, 8, 8, 4.4], [28, 0, 114.8, 8, 8, 4.4],
    [-22, 12, 114.4, 9, 6, 4.0], [22, 12, 114.4, 9, 6, 4.0],
    [-22, -12, 114.4, 9, 6, 4.0], [22, -12, 114.4, 9, 6, 4.0],
    [-8, 17, 114.5, 10, 5, 4.0], [8, 17, 114.5, 10, 5, 4.0],
    [-8, -17, 114.5, 10, 5, 4.0], [8, -17, 114.5, 10, 5, 4.0],
  ].forEach(([x, y, z, sx, sy, sz], i) => {
    parts.push({ name: `hat-lobe-${i}`, shape: ellipsoid([x, y, z], [sx, sy, sz]), color: palette.cream });
  });

  // Curled stem approximation.
  capsule(parts, "stem-a", [0, 0, 122], [-3.0, 0, 134], 3.2, palette.pit);
  capsule(parts, "stem-b", [-3.0, 0, 134], [4.3, 0, 137], 3.0, palette.pit);
  parts.push({ name: "stem-tip", shape: ellipsoid([6.2, 0, 135.5], [3.4, 3.4, 3.4]), color: palette.pit });

  // Leaf plus veins.
  parts.push({ name: "leaf", shape: ellipsoid([15, 0.5, 133.5], [14, 3.1, 7.2], [0, -0.42, 0]), color: palette.leaf });
  capsule(parts, "leaf-vein", [4.5, 3.3, 129.5], [24.0, 3.3, 137.2], 0.75, palette.leafDark);
  capsule(parts, "leaf-vein-a", [13.0, 3.1, 133.2], [16.0, 3.1, 139.0], 0.45, palette.leafDark);
  capsule(parts, "leaf-vein-b", [16.0, 3.1, 134.3], [20.0, 3.1, 130.2], 0.45, palette.leafDark);

  return parts;
}

function exportParts(parts) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  parts.forEach((part, index) => addPart(doc, part, index));

  const path = `/avocado-${Date.now()}.glb`;
  const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(path), true);
  const ok = writer.Perform_2(
    new oc.Handle_TDocStd_Document_2(doc),
    new oc.TColStd_IndexedDataMapOfStringString_1(),
    new oc.Message_ProgressRange_1(),
  );
  if (!ok) throw new Error("OCCT no pudo exportar el personaje a GLB.");

  const glb = oc.FS.readFile(path, { encoding: "binary" });
  oc.FS.unlink(path);
  return URL.createObjectURL(new Blob([glb.buffer], { type: "model/gltf-binary" }));
}

async function rebuild() {
  if (!oc) return;
  rebuildButton.disabled = true;
  status.textContent = "Construyendo el aguacate con sólidos B-Rep de OCCT…";

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const parts = buildCharacter();
    status.textContent = `Mallando y aplicando materiales PBR a ${parts.length} piezas…`;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const nextUrl = exportParts(parts);
    viewer.src = nextUrl;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = nextUrl;
    status.textContent = `Listo · ${parts.length} piezas CAD · OCCT → GLB → model-viewer`;
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
  viewer.cameraOrbit = "0deg 78deg 170%";
  viewer.jumpCameraToGoal?.();
});
threeQuarterButton.addEventListener("click", () => {
  viewer.cameraOrbit = "-32deg 72deg 175%";
  viewer.jumpCameraToGoal?.();
});

async function boot() {
  try {
    status.textContent = "Cargando OpenCascade.js / WebAssembly…";
    oc = await initOpenCascade({
      locateFile: (path) => (path.endsWith(".wasm") ? openCascadeWasm : path),
    });
    rebuildButton.disabled = false;
    await rebuild();
  } catch (error) {
    console.error(error);
    status.textContent = `No se pudo iniciar OpenCascade.js: ${error instanceof Error ? error.message : String(error)}`;
    rebuildButton.textContent = "OCCT no disponible";
  }
}

boot();
