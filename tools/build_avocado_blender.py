import bpy
import math
import os
from mathutils import Vector

# Headless Blender generator for the high-quality mascot test.
# Output is consumed directly by GitHub Pages / model-viewer.

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public", "avocado-blender.glb")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def mat(name, color, roughness=0.48, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


GREEN = mat("Skin", (0.20, 0.48, 0.10), 0.62)
GREEN_LIGHT = mat("Flesh", (0.70, 0.92, 0.25), 0.54)
CREAM = mat("FleshHighlight", (1.0, 0.93, 0.45), 0.48)
PIT = mat("Pit", (0.58, 0.25, 0.07), 0.24)
PIT_DARK = mat("PitDark", (0.35, 0.12, 0.025), 0.44)
BLACK = mat("FaceBlack", (0.015, 0.01, 0.008), 0.32)
WHITE = mat("EyeGlint", (1.0, 1.0, 0.95), 0.2)
PINK = mat("Cheek", (1.0, 0.28, 0.34), 0.56)
TONGUE = mat("Tongue", (1.0, 0.18, 0.28), 0.46)
HAT = mat("HatCream", (1.0, 0.72, 0.52), 0.62)
HAT_LIGHT = mat("HatLight", (1.0, 0.86, 0.66), 0.54)
LEAF = mat("Leaf", (0.46, 0.78, 0.08), 0.58)
LEAF_DARK = mat("LeafVein", (0.20, 0.48, 0.04), 0.66)


def smooth(obj):
    if getattr(obj.data, "polygons", None):
        for p in obj.data.polygons:
            p.use_smooth = True


def add_uv(name, loc, scale, material, segments=96, rings=64):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    smooth(obj)
    return obj


def avocado_mesh(name, loc, size, material, front_factor=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=112, ring_count=72, location=loc)
    obj = bpy.context.object
    obj.name = name
    sx, sy, sz = size
    for v in obj.data.vertices:
        z = max(-1.0, min(1.0, v.co.z))
        t = (z + 1.0) * 0.5
        taper = 1.20 - 0.52 * t
        lower_bulb = 1.0 + 0.10 * math.exp(-((z + 0.28) / 0.48) ** 2)
        v.co.x *= sx * taper * lower_bulb
        v.co.y *= sy * (1.03 - 0.10 * t) * front_factor
        v.co.z *= sz
    obj.data.materials.append(material)
    smooth(obj)
    bevel = obj.modifiers.new("Soft bevel", "BEVEL")
    bevel.width = 0.35
    bevel.segments = 3
    return obj


def add_curve(name, points, bevel, material, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 18
    curve.bevel_depth = bevel
    curve.bevel_resolution = 6
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, co in zip(spline.bezier_points, points):
        bp.co = co
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def wavy_hat():
    verts = []
    faces = []
    rings = 14
    seg = 128
    for ri in range(rings + 1):
        rr = ri / rings
        for i in range(seg):
            a = 2 * math.pi * i / seg
            edge_wave = 1.0 + 0.07 * math.sin(6 * a) * (rr ** 3)
            rad_x = 2.88 * rr * edge_wave
            rad_y = 1.72 * rr * edge_wave
            z = 5.78 + 0.08 * math.sin(6 * a) * rr + 0.10 * (rr ** 2)
            verts.append((rad_x * math.cos(a), rad_y * math.sin(a), z))
    for ri in range(rings):
        for i in range(seg):
            ni = (i + 1) % seg
            a = ri * seg + i
            b = ri * seg + ni
            c = (ri + 1) * seg + ni
            d = (ri + 1) * seg + i
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new("WavyHatMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Wavy hat brim", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(HAT_LIGHT)
    smooth(obj)
    solid = obj.modifiers.new("Hat thickness", "SOLIDIFY")
    solid.thickness = 0.22
    solid.offset = 0.0
    bevel = obj.modifiers.new("Hat soft edge", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 3
    return obj


def leaf_mesh():
    verts = []
    faces = []
    n = 72
    # Lens-like leaf with pointed ends and a gentle cup.
    for i in range(n + 1):
        t = i / n
        x = -1.25 + 2.5 * t
        width = 0.78 * math.sin(math.pi * t) ** 0.78
        z = 6.78 + 0.22 * math.sin(math.pi * t)
        y = -0.18 + 0.12 * math.sin(math.pi * t)
        verts.append((x, y - width, z))
        verts.append((x, y + width, z + 0.10 * math.sin(math.pi * t)))
    for i in range(n):
        a = i * 2
        faces.append((a, a + 2, a + 3, a + 1))
    mesh = bpy.data.meshes.new("LeafMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Leaf", mesh)
    bpy.context.collection.objects.link(obj)
    obj.location.x = 1.12
    obj.rotation_euler = (math.radians(11), math.radians(-18), math.radians(18))
    obj.data.materials.append(LEAF)
    solid = obj.modifiers.new("Leaf thickness", "SOLIDIFY")
    solid.thickness = 0.10
    bevel = obj.modifiers.new("Leaf bevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    return obj


# Main continuous organic body.
body = avocado_mesh("Avocado body", (0, 0, 2.55), (2.65, 1.52, 3.0), GREEN)

# Front flesh is a thin organic insert rather than a stack of separate balls.
flesh = avocado_mesh("Flesh insert", (0, -1.39, 2.62), (2.13, 0.22, 2.48), GREEN_LIGHT, 0.72)
upper_glow = avocado_mesh("Flesh warm highlight", (0, -1.57, 3.38), (1.55, 0.065, 1.52), CREAM, 0.58)

# Pit, face and expressions.
pit = add_uv("Pit", (0, -1.78, 1.72), (1.04, 0.42, 1.15), PIT)
add_uv("Pit highlight", (-0.30, -2.17, 2.16), (0.21, 0.055, 0.28), HAT_LIGHT, 64, 40)

for x in (-0.74, 0.74):
    add_uv("Eye", (x, -1.72, 3.93), (0.27, 0.12, 0.42), BLACK, 64, 48)
    add_uv("Eye glint", (x - 0.07, -1.84, 4.05), (0.075, 0.035, 0.11), WHITE, 48, 32)
add_uv("Cheek L", (-1.34, -1.71, 3.46), (0.34, 0.075, 0.20), PINK, 56, 36)
add_uv("Cheek R", (1.34, -1.71, 3.46), (0.34, 0.075, 0.20), PINK, 56, 36)
add_uv("Mouth", (0, -1.76, 3.35), (0.43, 0.10, 0.28), BLACK, 64, 40)
add_uv("Tongue", (0, -1.86, 3.26), (0.22, 0.045, 0.11), TONGUE, 48, 32)

# Curved arms and soft feet.
add_curve("Left arm", [(-2.10, -0.15, 2.85), (-2.63, -0.24, 3.05), (-2.92, -0.35, 3.34)], 0.18, GREEN)
add_curve("Right arm", [(2.10, -0.15, 2.85), (2.62, -0.24, 3.05), (2.92, -0.35, 3.34)], 0.18, GREEN)
add_uv("Left foot", (-1.15, -0.18, -0.06), (0.64, 0.55, 0.25), GREEN, 72, 48)
add_uv("Right foot", (1.15, -0.18, -0.06), (0.64, 0.55, 0.25), GREEN, 72, 48)

# Small skin freckles for depth.
for i, (x, y, z, s) in enumerate([
    (-2.20, -1.02, 1.10, .09), (-2.35, -0.92, 2.05, .07), (-2.12, -1.08, 3.05, .08),
    (2.20, -1.02, 1.22, .08), (2.35, -0.92, 2.18, .10), (2.12, -1.08, 3.16, .07),
]):
    add_uv(f"Freckle {i}", (x, y, z), (s, .045, s), LEAF_DARK, 32, 20)

# Hat: one continuous wavy brim + soft crown.
wavy_hat()
add_uv("Hat crown", (0, -0.02, 5.96), (2.02, 1.26, 0.37), HAT, 96, 56)

# Curled stem, true Bezier tube.
add_curve("Curled stem", [
    (0.05, 0, 6.12), (-0.08, 0, 6.70), (0.32, 0, 7.00), (0.64, 0, 6.73), (0.43, 0, 6.47)
], 0.16, PIT_DARK)

leaf_mesh()
add_curve("Leaf vein", [(0.13, -0.22, 6.84), (1.10, -0.23, 7.05), (2.14, -0.18, 7.22)], 0.035, LEAF_DARK)
add_curve("Leaf vein A", [(1.05, -0.22, 7.04), (1.28, -0.23, 7.37)], 0.023, LEAF_DARK)
add_curve("Leaf vein B", [(1.43, -0.22, 7.10), (1.66, -0.22, 6.85)], 0.023, LEAF_DARK)

# Apply modifiers and convert curves for robust glTF export.
for obj in list(bpy.context.scene.objects):
    if obj.type == "CURVE":
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)

for obj in list(bpy.context.scene.objects):
    if obj.type == "MESH":
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception:
                pass
        smooth(obj)

# Export only geometry/materials. model-viewer supplies camera and environment.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
)

print(f"Generated {OUT}")
