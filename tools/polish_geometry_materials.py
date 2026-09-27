"""Polish geometry and separate conservative surface materials before animation."""
import bmesh
import gc

original_vertices=len(body.data.vertices)
original_triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
bm=bmesh.new(); bm.from_mesh(body.data)
loose=[v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm,geom=loose,context='VERTS')
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000008)
bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(body.data); bm.free(); gc.collect()
body.data.update()
cleanup={'before_vertices':original_vertices,'after_vertices':len(body.data.vertices),
         'before_triangles':original_triangles,'loose_vertices_removed':len(loose),
         'weld_tolerance_m':.000008}
high=body.copy();high.data=body.data.copy();bpy.context.scene.collection.objects.link(high)
high.name='Original_High_Detail_Bake_Source'

decimate=body.modifiers.new('Preserve more sculpted detail','DECIMATE')
decimate.ratio=.60;decimate.use_collapse_triangulate=True
bpy.context.view_layer.objects.active=body
bpy.ops.object.modifier_apply(modifier=decimate.name)
triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
assert 850000<triangles<930000,triangles
for polygon in body.data.polygons: polygon.use_smooth=True

before=np.empty(len(body.data.vertices)*3,dtype=np.float32)
body.data.vertices.foreach_get('co',before)
coords=before.reshape((-1,3));vx,vy,vz=coords.T
skin_region=((np.abs(vx)>.25)&(vz>1.13)&(vz<1.35))|((np.abs(vx)>.32)&(vz>.76)&(vz<.96))|((np.abs(vx)<.075)&(vy<-.10)&(vz>1.51)&(vz<1.64))
group=body.vertex_groups.new(name='Gentle_skin_surface_polish')
group.add(np.flatnonzero(skin_region).tolist(),.5,'REPLACE')
modifier=body.modifiers.new('Restrained skin smoothing','SMOOTH')
modifier.factor=.18;modifier.iterations=2;modifier.vertex_group=group.name
bpy.ops.object.modifier_apply(modifier=modifier.name)
after=np.empty_like(before);body.data.vertices.foreach_get('co',after)
cleanup['maximum_skin_smoothing_m']=float(np.linalg.norm((after-before).reshape((-1,3)),axis=1).max())
assert cleanup['maximum_skin_smoothing_m']<.005

original_material=body.data.materials[0].copy();original_material.name='Before_uniform_finish'
source_image=next(n.image for n in original_material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.size[0]>=2048)
# Classify by anatomical region and existing atlas colour; keep ambiguous areas leather.
pixels=np.empty(source_image.size[0]*source_image.size[1]*4,dtype=np.float32)
source_image.pixels.foreach_get(pixels)
pixels=pixels.reshape((source_image.size[1],source_image.size[0],4))
uv_layer=body.data.uv_layers.active.data
uvs=np.empty(len(uv_layer)*2,dtype=np.float32);uv_layer.foreach_get('uv',uvs);uvs=uvs.reshape((-1,2))
starts=np.empty(len(body.data.polygons),dtype=np.int32);body.data.polygons.foreach_get('loop_start',starts)
uv=uvs[starts]
rgb=pixels[np.clip((uv[:,1]*source_image.size[1]).astype(int),0,source_image.size[1]-1),np.clip((uv[:,0]*source_image.size[0]).astype(int),0,source_image.size[0]-1),:3]
centers=np.array([tuple(p.center) for p in body.data.polygons],dtype=np.float32)
px,py,pz=centers.T
r,g,b=rgb.T
saturation=(rgb.max(axis=1)-rgb.min(axis=1))/np.maximum(rgb.max(axis=1),.001)
warm=(r>g*1.08)&(r>b*1.15)
neutral=(saturation<.27)&(rgb.max(axis=1)>.025)
ids=np.zeros(len(centers),dtype=np.int32)
fur=((py>.04)&(pz>.57)&(pz<1.61))|((np.abs(px)>.17)&(pz>1.32)&(pz<1.59))|((pz>.37)&(pz<.48))
ids[fur]=1
beard=(np.abs(px)<.22)&(pz>1.16)&(pz<1.65)&(py<-.08)
ids[beard]=1
horns=(pz>1.71)&(np.abs(px)>.105)
ids[horns]=2
skin=warm&(((np.abs(px)>.25)&(pz>1.12)&(pz<1.35))|((np.abs(px)>.32)&(pz>.76)&(pz<.96))|((np.abs(px)<.08)&(py<-.10)&(pz>1.51)&(pz<1.65)))
ids[skin]=3
helmet=(pz>1.65)&(pz<1.83)&(np.abs(px)<.16)
brooches=(((np.abs(px)-.15)/.06)**2+((pz-1.40)/.065)**2<1)&(py<-.10)
buckle=(np.abs(px)<.067)&(pz>.96)&(pz<1.06)&(py<-.13)
bracers=(np.abs(px)>.30)&(pz>.96)&(pz<1.17)
ids[neutral&(helmet|brooches|buckle|bracers)&~horns&~skin]=4
body.data.materials.clear()
surface_specs=[('Weathered_leather',.66,0),('Fur_and_beard',.88,0),('Aged_horn',.58,0),('Natural_skin',.53,0),('Forged_metal',.39,.72)]
for name,roughness,metallic in surface_specs:
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value=roughness
    bsdf.inputs['Metallic'].default_value=metallic
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=source_image
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    body.data.materials.append(mat)
body.data.polygons.foreach_set('material_index',ids)
material_counts={spec[0]:int(np.sum(ids==i)) for i,spec in enumerate(surface_specs)}
assert all(n>100 for n in material_counts.values()),material_counts
del pixels,uvs,rgb,centers,coords,before,after
gc.collect()

# Bake actual high-resolution geometry into a portable tangent-space normal map.
normal=bpy.data.images.new('Viking_Baked_Detail_Normal_4K',width=4096,height=4096,alpha=False)
normal.colorspace_settings.name='Non-Color'
for mat in body.data.materials:
    node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=normal
    mat.node_tree.nodes.active=node;node.select=True
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.render.bake.use_selected_to_active=True
scene.render.bake.cage_extrusion=.003
scene.render.bake.max_ray_distance=.015
bpy.ops.object.select_all(action='DESELECT');high.select_set(True);body.select_set(True)
bpy.context.view_layer.objects.active=body
print('POLISH_BAKE_START',flush=True)
bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',margin=8)
normal.pack()
for mat in body.data.materials:
    tex=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image==normal)
    n=mat.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65
    mat.node_tree.links.new(tex.outputs['Color'],n.inputs['Color'])
    mat.node_tree.links.new(n.outputs['Normal'],mat.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
bpy.data.objects.remove(high,do_unlink=True)
body.select_set(True);bpy.context.view_layer.objects.active=body
print('POLISH_GEOMETRY_MATERIALS_DONE',json.dumps({'cleanup':cleanup,'materials':material_counts,'triangles':triangles}),flush=True)
