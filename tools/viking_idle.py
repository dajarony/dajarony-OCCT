"""Make a restrained five-second idle from the existing Viking mesh."""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/viking/source.glb'
OUT = ROOT / 'output/viking-idle'
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(objects) == 1, len(objects)
body = objects[0]
bounds = [body.matrix_world @ Vector(c) for c in body.bound_box]
lo = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
middle = (lo + hi) / 2
transform = (Matrix.Rotation(-math.pi/2, 4, 'Z')
             @ Matrix.Scale(1.9/(hi.z-lo.z), 4)
             @ Matrix.Translation(Vector((-middle.x, -middle.y, -lo.z))))
body.matrix_world = transform @ body.matrix_world
bpy.context.view_layer.update()
body.name = 'Viking_Idle'

# Keep the character usable in the existing browser viewer.
modifier = body.modifiers.new('Optimized geometry', 'DECIMATE')
modifier.ratio = .36
modifier.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier=modifier.name)
triangles = sum(len(p.vertices)-2 for p in body.data.polygons)
assert 500000 <= triangles <= 550000, triangles
for material in bpy.data.materials:
    bsdf = material.node_tree.nodes.get('Principled BSDF') if material.use_nodes else None
    if bsdf:
        bsdf.inputs['Roughness'].default_value = .76

basis = body.shape_key_add(name='Base', from_mix=False)
basis_world = [body.matrix_world @ p.co for p in basis.data]
inverse = body.matrix_world.inverted()

def clamp(v):
    return max(0.0, min(1.0, v))

def smooth(v):
    v = clamp(v)
    return v*v*(3-2*v)

def shape(name, motion):
    key = body.shape_key_add(name=name, from_mix=False)
    moved = 0
    largest = 0.0
    for i, point in enumerate(basis_world):
        shifted = motion(point)
        distance = (shifted-point).length
        if distance > 0.0001:
            moved += 1
            largest = max(largest, distance)
        key.data[i].co = inverse @ shifted
    return {'name': name, 'vertices_moved': moved, 'maximum_offset_m': round(largest, 5)}

def breath(p):
    x,y,z=p
    weight = math.exp(-((z-1.33)/.26)**2) * smooth((.33-abs(x))/.12)
    return Vector((x*(1+.012*weight), y*(1+.012*weight), z+.004*weight))

def head_turn(p):
    x,y,z=p
    weight = smooth((z-1.39)/.29) * smooth((.39-abs(x))/.16)
    angle = .045 * weight
    return Vector((x*math.cos(angle)-y*math.sin(angle),
                   x*math.sin(angle)+y*math.cos(angle), z))

def cape(p):
    x,y,z=p
    back = smooth((y-.045)/.13)
    lower = smooth((1.60-z)/.48)
    above_legs = smooth((z-.72)/.22)
    weight = back*lower*above_legs
    return Vector((x+.016*weight, y+.004*weight, z))

shapes = [shape('Breath', breath), shape('HeadTurn', head_turn), shape('CapeSway', cape)]

frames = [
    (1,   0.0, 0.0, 0.0),
    (21,  0.5, 0.15, 0.25),
    (41,  1.0, 0.35, 0.8),
    (61,  0.5, 1.0, 0.4),
    (81,  0.0, 0.25, 0.0),
    (101, 0.5, 0.0, 0.5),
    (121, 0.0, 0.0, 0.0),
]
for frame, breathing, turning, sway in frames:
    for name,value in [('Breath',breathing),('HeadTurn',turning),('CapeSway',sway)]:
        key = body.data.shape_keys.key_blocks[name]
        key.value = value
        key.keyframe_insert(data_path='value', frame=frame)
for action in bpy.data.actions:
    action.name = 'Idle_Suave'
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 121
bpy.context.scene.render.fps = 24
bpy.context.scene.frame_set(1)
assert body.data.shape_keys.animation_data.action is not None

destination = OUT / 'Viking_Idle.glb'
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB',
                          export_apply=True, export_animations=True)
report = {
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'blender_version': bpy.app.version_string,
    'triangles': triangles,
    'fps': 24,
    'frames': 120,
    'duration_seconds': 5,
    'shapes': shapes,
    'mouth_animated': False,
    'file_bytes': destination.stat().st_size,
}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print('VIKING_IDLE_COMPLETE',json.dumps(report))
