import "./style.css";
import "@google/model-viewer";
import initOpenCascade from "opencascade.js";

const controls = {
  width: document.querySelector("#width"),
  depth: document.querySelector("#depth"),
  height: document.querySelector("#height"),
  radius: document.querySelector("#radius"),
};

const values = {
  width: document.querySelector("#widthValue"),
  depth: document.querySelector("#depthValue"),
  height: document.querySelector("#heightValue"),
  radius: document.querySelector("#radiusValue"),
};

const viewer = document.querySelector("#viewer");
const rebuildButton = document.querySelector("#rebuild");
const status = document.querySelector("#status");

let oc = null;
let currentObjectUrl = null;
let rebuilding = false;
let queued = false;

function readParams() {
  return {
    width: Number(controls.width.value),
    depth: Number(controls.depth.value),
    height: Number(controls.height.value),
    radius: Number(controls.radius.value),
  };
}

function syncLabels() {
  for (const key of Object.keys(controls)) {
    values[key].textContent = controls[key].value;
  }
}

function visualizeShape(shape) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  shapeTool.SetShape(shapeTool.NewShape(), shape);

  new oc.BRepMesh_IncrementalMesh_2(shape, 0.5, false, 0.25, false);

  const path = `/model-${Date.now()}-${Math.random().toString(16).slice(2)}.glb`;
  const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(path), true);
  writer.Perform_2(
    new oc.Handle_TDocStd_Document_2(doc),
    new oc.TColStd_IndexedDataMapOfStringString_1(),
    new oc.Message_ProgressRange_1(),
  );

  const glb = oc.FS.readFile(path, { encoding: "binary" });
  oc.FS.unlink(path);

  return URL.createObjectURL(
    new Blob([glb.buffer], { type: "model/gltf-binary" }),
  );
}

function buildCadShape({ width, depth, height, radius }) {
  // Exact OCCT B-Rep primitive.
  const box = new oc.BRepPrimAPI_MakeBox_2(width, depth, height);

  // The spherical cutter is deliberately offset so the Boolean operation is
  // easy to see while rotating the model.
  const center = new oc.gp_Pnt_3(width * 0.62, depth * 0.52, height * 0.72);
  const sphere = new oc.BRepPrimAPI_MakeSphere_5(center, radius);

  const cut = new oc.BRepAlgoAPI_Cut_3(
    box.Shape(),
    sphere.Shape(),
    new oc.Message_ProgressRange_1(),
  );
  cut.Build(new oc.Message_ProgressRange_1());

  if (!cut.IsDone()) {
    throw new Error("OCCT no pudo completar la operación booleana.");
  }

  return cut.Shape();
}

async function rebuild() {
  if (!oc) return;

  if (rebuilding) {
    queued = true;
    return;
  }

  rebuilding = true;
  rebuildButton.disabled = true;
  status.textContent = "Regenerando B-Rep con Open CASCADE…";

  try {
    const params = readParams();
    const shape = buildCadShape(params);
    const nextUrl = visualizeShape(shape);

    viewer.src = nextUrl;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = nextUrl;

    status.textContent = `Modelo listo · ${params.width} × ${params.depth} × ${params.height} mm · vaciado R${params.radius} mm`;
  } catch (error) {
    console.error(error);
    status.textContent = `Error de OCCT: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    rebuilding = false;
    rebuildButton.disabled = false;

    if (queued) {
      queued = false;
      rebuild();
    }
  }
}

for (const input of Object.values(controls)) {
  input.addEventListener("input", syncLabels);
  input.addEventListener("change", rebuild);
}

rebuildButton.addEventListener("click", rebuild);

async function boot() {
  syncLabels();

  try {
    oc = await initOpenCascade();
    rebuildButton.disabled = false;
    rebuildButton.textContent = "Regenerar modelo";
    status.textContent = "OCCT listo. Generando primer sólido…";
    await rebuild();
  } catch (error) {
    console.error(error);
    status.textContent = `No se pudo iniciar OpenCascade.js: ${error instanceof Error ? error.message : String(error)}`;
    rebuildButton.textContent = "OCCT no disponible";
  }
}

boot();
