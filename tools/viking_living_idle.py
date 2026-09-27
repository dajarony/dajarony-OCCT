"""Create a seamless idle with grounded feet and restrained secondary motion."""
import bpy
import hashlib
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/viking/source.glb'
OUT = ROOT / 'output/viking-living-idle'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1
body = meshes[0]
bounds = [body.matrix_world @ Vector(c) for c in body.bound_box]
lo = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
middle = (lo + hi) / 2
world = (Matrix.Rotation(-math.pi/2, 4, 'Z') @ Matrix.Scale(1.9/(hi.z-lo.z),4)
         @ Matrix.Translation(Vector((-middle.x,-middle.y,-lo.z))) @ body.matrix_world)
body.parent = None
body.matrix_world = world
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
body.name = 'Viking_Reposo_Vivo'
decimate = body.modifiers.new('Optimized geometry', 'DECIMATE')
decimate.ratio = .36
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)
triangles = sum(len(p.vertices)-2 for p in body.data.polygons)
assert 500000 <= triangles <= 550000
for material in body.data.materials:
    bsdf = material.node_tree.nodes.get('Principled BSDF') if material.use_nodes else None
    if bsdf:
        bsdf.inputs['Roughness'].default_value = .76

basis = body.shape_key_add(name='Base')
points = np.empty(len(basis.data)*3, dtype=np.float32)
basis.data.foreach_get('co', points)
points = points.reshape((-1,3))
x,y,z = points.T
def smooth(v):
    v = np.clip(v,0,1)
    return v*v*(3-2*v)
def band(v, low, high, edge):
    return smooth((v-low)/edge)*smooth((high-v)/edge)
shapes = []
def add_shape(name, delta):
    assert np.isfinite(delta).all()
    key = body.shape_key_add(name=name)
    key.slider_min = -1
    key.slider_max = 1
    key.data.foreach_set('co', np.ascontiguousarray(points+delta).ravel())
    distances = np.linalg.norm(delta,axis=1)
    shapes.append({'name':name,'vertices_moved':int(np.sum(distances>.0001)),
                   'maximum_offset_m':float(distances.max())})
    assert distances[z<.18].max() < 1e-6, 'Boot soles must remain stationary'
    return key

chest = np.exp(-((z-1.30)/.25)**2)*smooth((.34-np.abs(x))/.15)*smooth((z-.45)/.2)
d = np.zeros_like(points)
d[:,0]=x*.019*chest; d[:,1]=y*.025*chest; d[:,2]=.0065*chest
add_shape('Respiracion', d)

# Smooth lateral displacement, with both soles anchored and no vertical bounce.
upper = smooth((z-.20)/1.15)
d = np.zeros_like(points)
d[:,0]=.022*upper
d[:,1]=.004*upper
add_shape('Cambio_de_peso', d)

head = smooth((z-1.40)/.28)*smooth((.40-np.abs(x))/.16)
angle = .075*head
d = np.zeros_like(points)
d[:,0]=x*np.cos(angle)-y*np.sin(angle)-x
d[:,1]=x*np.sin(angle)+y*np.cos(angle)-y
add_shape('Cabeza', d)

# Geometric masks are a lightweight approximation for this fused source mesh.
cape = smooth((y-.055)/.13)*smooth((1.59-z)/.43)*smooth((z-.65)/.2)
d=np.zeros_like(points)
d[:,0]=.032*cape
d[:,1]=.012*cape
add_shape('Capa', d)

cloth = smooth((-y-.06)/.10)*band(z,.52,1.04,.13)*smooth((.22-np.abs(x))/.08)
d=np.zeros_like(points)
d[:,0]=.010*cloth
d[:,1]=-.018*cloth
add_shape('Faldones', d)

beard = smooth((-y-.12)/.08)*band(z,1.13,1.53,.12)*smooth((.18-np.abs(x))/.07)
d=np.zeros_like(points)
d[:,0]=.008*beard
d[:,1]=-.005*beard
add_shape('Barba', d)

scene=bpy.context.scene
scene.frame_start=1; scene.frame_end=193; scene.render.fps=24
keys=body.data.shape_keys.key_blocks
samples=[]
for frame in range(1,194,4):
    t=2*math.pi*(frame-1)/192
    values={
        'Respiracion':.5-.5*math.cos(2*t),
        'Cambio_de_peso':.78*math.sin(t),
        'Cabeza':.7*math.sin(t+.5)+.15*math.sin(2*t-.4),
        'Capa':.65*math.sin(2*t-.65)+.22*math.sin(t+.2),
        'Faldones':.60*math.sin(2*t-1.0)+.18*math.sin(3*t+.3),
        'Barba':.60*math.sin(2*t-.4)+.2*math.sin(t-.7),
    }
    samples.append(values)
    for name,value in values.items():
        keys[name].value=value
        keys[name].keyframe_insert(data_path='value',frame=frame)
assert max(abs(samples[0][k]-samples[-1][k]) for k in samples[0]) < 1e-6
action=body.data.shape_keys.animation_data.action
action.name='Reposo_Vivo_8s'
for curve in action.fcurves:
    for key in curve.keyframe_points:
        key.interpolation='LINEAR'
scene.frame_set(1)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Viking_Reposo_Vivo.blend'),compress=True)
destination=OUT/'Viking_Reposo_Vivo.glb'
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',
    use_selection=True,export_animations=True,export_morph=True,
    export_morph_normal=True,export_frame_range=True,export_force_sampling=True)
report={
    'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'blender_version':bpy.app.version_string,'triangles':triangles,
    'duration_seconds':8,'fps':24,'animation':action.name,'shapes':shapes,
    'loop_verified':True,'soles_anchored':True,'mouth_animated':False,
    'method':'six morph targets; procedural motion, no cloth simulation or skeleton',
    'file_bytes':destination.stat().st_size,
    'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
    'front_axis_blender':'-Y','front_camera_orbit_gltf_degrees':0,
}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print('VIKING_LIVING_IDLE_COMPLETE',json.dumps(report),flush=True)
