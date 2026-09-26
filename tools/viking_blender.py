"""Inspect and render the user-supplied Viking without changing source bytes."""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/viking/source.glb'
OUT = ROOT / 'output/viking'
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
models = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert models, 'Source contains no mesh'
corners = [o.matrix_world @ Vector(c) for o in models for c in o.bound_box]
lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
height = hi.z - lo.z
assert height > 0
scale = 1.90 / height
center = (lo + hi) / 2
for o in models:
    o.location.x -= center.x
    o.location.y -= center.y
    o.location.z -= lo.z
    o.location *= scale
    o.scale *= scale
    o.name = 'Viking_Original'

report = {
    'blender_version': bpy.app.version_string,
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'source_bytes': SOURCE.stat().st_size,
    'source_vertices': sum(len(o.data.vertices) for o in models),
    'source_triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in models),
    'height_m': 1.90,
    'height_is_presentation_assumption': True,
    'textures': [{'name': im.name, 'width': im.size[0], 'height': im.size[1]} for im in bpy.data.images if im.size[0]],
    'stage': 'inspection',
}
(OUT / 'inspection.json').write_text(json.dumps(report, indent=2))

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x = 600
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX' if bpy.app.version >= (4, 0, 0) else 'Filmic'
scene.view_settings.look = 'Medium High Contrast' if bpy.app.version < (4, 0, 0) else 'AgX - Medium High Contrast'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.18, 0.22, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.35

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def area(name, loc, energy, color, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.location = loc
    aim(ob, (0, 0, 1.0))

area('Key softbox', (3, -4, 4.5), 650, (1.0, .87, .73), 4)
area('Fill softbox', (-3, -2, 2.8), 420, (.70, .82, 1), 3)
area('Back softbox', (1.5, 3.0, 3.5), 800, (.76, .87, 1), 3)
area('Rear fill', (-3, 3, 2), 350, (1, .9, .8), 3)

bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.005))
floor = bpy.context.object
floor.name = 'Studio ground'
mat = bpy.data.materials.new('Charcoal studio')
mat.diffuse_color = (.035, .045, .058, 1)
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.035, .045, .058, 1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .8
floor.data.materials.append(mat)

cam_data = bpy.data.cameras.new('Studio camera')
camera = bpy.data.objects.new('Studio camera', cam_data)
scene.collection.objects.link(camera)
scene.camera = camera
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.30
for name, loc in [('front',(0,-5,1.16)), ('rear',(0,5,1.16)), ('left',(-5,0,1.16)), ('three-quarter',(3,-5,1.6))]:
    camera.location = loc
    aim(camera, (0,0,.95))
    scene.render.filepath = str(OUT / f'original-{name}.png')
    bpy.ops.render.render(write_still=True)
print('VIKING_INSPECTION_COMPLETE', json.dumps(report))
