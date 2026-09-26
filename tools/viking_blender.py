"""Build a Blender studio scene and two GLBs from the user-supplied Viking."""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector, Matrix

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
# Apply the normalization to evaluated world matrices in one operation. A
# rotation after editing object properties can otherwise reuse stale matrices.
transform = (Matrix.Rotation(-math.pi / 2, 4, 'Z')
             @ Matrix.Scale(scale, 4)
             @ Matrix.Translation(Vector((-center.x, -center.y, -lo.z))))
for o in models:
    o.matrix_world = transform @ o.matrix_world
    o.name = 'Viking_Hero'
bpy.context.view_layer.update()
new_corners = [o.matrix_world @ Vector(c) for o in models for c in o.bound_box]
new_lo = Vector(tuple(min(v[i] for v in new_corners) for i in range(3)))
new_hi = Vector(tuple(max(v[i] for v in new_corners) for i in range(3)))
assert abs(new_lo.z) < 0.002 and abs(new_hi.z - 1.90) < 0.002, (new_lo, new_hi)
assert abs(new_lo.x + new_hi.x) < 0.002 and abs(new_lo.y + new_hi.y) < 0.002, (new_lo, new_hi)

# The original uses one 4K color atlas and one very matte material. Preserve
# its painted detail, then add a restrained micro-bump for close Blender renders.
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    nodes = material.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    if bsdf is None:
        continue
    bsdf.inputs['Roughness'].default_value = 0.76
    color_link = next((link for link in material.node_tree.links if link.to_node == bsdf and link.to_socket.name == 'Base Color'), None)
    if color_link and color_link.from_node.type == 'TEX_IMAGE':
        bw = nodes.new('ShaderNodeRGBToBW')
        bw.label = 'Albedo micro detail for Blender only'
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.12
        bump.inputs['Distance'].default_value = 0.0018
        material.node_tree.links.new(color_link.from_socket, bw.inputs['Color'])
        material.node_tree.links.new(bw.outputs['Val'], bump.inputs['Height'])
        material.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

report = {
    'blender_version': bpy.app.version_string,
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'source_bytes': SOURCE.stat().st_size,
    'source_vertices': sum(len(o.data.vertices) for o in models),
    'source_triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in models),
    'height_m': 1.90,
    'height_is_presentation_assumption': True,
    'world_bounds_min': tuple(new_lo),
    'world_bounds_max': tuple(new_hi),
    'textures': [{'name': im.name, 'width': im.size[0], 'height': im.size[1]} for im in bpy.data.images if im.size[0]],
    'stage': 'enhanced',
    'changes': ['presentation scale and orientation', 'material roughness 0.76', 'micro bump in Blender scene', 'studio lighting', 'optimized mesh variant'],
}

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.resolution_x = 1000
scene.render.resolution_y = 1250
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX' if bpy.app.version >= (4, 0, 0) else 'Filmic'
scene.view_settings.look = 'Medium High Contrast' if bpy.app.version < (4, 0, 0) else 'AgX - Medium High Contrast'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.10, 0.12, 0.16, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.24

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

area('Warm key softbox', (2.8, -3.6, 4), 440, (1, .81, .63), 3.3)
area('Cool fill softbox', (-3.5, -2.8, 2.5), 210, (.59, .73, 1), 3.5)
area('Fur rim softbox', (2.2, 3.2, 3.5), 600, (.69, .82, 1), 2.5)
area('Rear edge softbox', (-2.7, 2.2, 2.5), 270, (1, .86, .70), 2.6)

bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.005))
floor = bpy.context.object
floor.name = 'Studio ground'
mat = bpy.data.materials.new('Charcoal studio')
mat.diffuse_color = (.025, .03, .042, 1)
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.025, .03, .042, 1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .8
floor.data.materials.append(mat)

cam_data = bpy.data.cameras.new('Studio camera')
camera = bpy.data.objects.new('Studio camera', cam_data)
scene.collection.objects.link(camera)
scene.camera = camera
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.25

# Save the complete editable scene, including packed source texture.
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.use_file_compression = True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'Viking_Studio.blend'))

# Export only the character. The lights and backdrop stay in the Blend scene.
bpy.ops.object.select_all(action='DESELECT')
for o in models:
    o.select_set(True)
bpy.context.view_layer.objects.active = models[0]
bpy.ops.export_scene.gltf(filepath=str(OUT / 'Viking_Hero.glb'), export_format='GLB', use_selection=True, export_apply=True)

for name, loc in [('front',(0,-5,1.08)), ('three-quarter',(3,-5,1.45)), ('back',(0,5,1.08))]:
    camera.location = loc
    aim(camera, (0,0,.95))
    scene.render.filepath = str(OUT / f'hero-{name}.png')
    bpy.ops.render.render(write_still=True)

# Preserve the hero source while creating a lighter, optional use variant.
optimized = []
for original in models:
    duplicate = original.copy()
    duplicate.data = original.data.copy()
    scene.collection.objects.link(duplicate)
    duplicate.name = 'Viking_Optimized'
    modifier = duplicate.modifiers.new('Controlled triangle reduction', 'DECIMATE')
    modifier.ratio = 0.36
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = duplicate
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    original.hide_render = True
    original.hide_set(True)
    optimized.append(duplicate)
report['optimized_triangles'] = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in optimized)
report['optimized_reduction_percent'] = round(100*(1-report['optimized_triangles']/report['source_triangles']), 1)

bpy.ops.object.select_all(action='DESELECT')
for o in optimized:
    o.select_set(True)
bpy.context.view_layer.objects.active = optimized[0]
bpy.ops.export_scene.gltf(filepath=str(OUT / 'Viking_Optimized.glb'), export_format='GLB', use_selection=True, export_apply=True)
camera.location = (3,-5,1.45)
aim(camera, (0,0,.95))
scene.render.filepath = str(OUT / 'optimized-three-quarter.png')
bpy.ops.render.render(write_still=True)
(OUT / 'report.json').write_text(json.dumps(report, indent=2))
print('VIKING_ENHANCEMENT_COMPLETE', json.dumps(report))
