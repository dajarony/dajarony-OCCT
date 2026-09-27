"""Render controlled material comparison and detailed views of the polished asset."""
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.cycles.use_denoising=False
scene.render.resolution_x=850;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.world.color=(.10,.10,.10)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.20,.24,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
def aim(obj,point):
    obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;aim(obj,(0,0,1))
area('Warm_softbox',(2.5,-3.8,3.8),460,(1,.86,.73),3)
area('Cool_fill',(-3,-2.5,2.2),260,(.70,.82,1),3)
area('Edge_light',(1.8,2.3,3),650,(.77,.87,1),2.5)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006))
floor=bpy.context.object;floor.name='Studio_floor'
mat=bpy.data.materials.new('Studio_charcoal');mat.use_nodes=True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.022,.028,.037,1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
floor.data.materials.append(mat)
data=bpy.data.cameras.new('Portrait_camera');camera=bpy.data.objects.new('Portrait_camera',data)
scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
def render(name,position,target,scale):
    camera.location=position;aim(camera,target);data.ortho_scale=scale
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
scene.frame_set(1)
render('polished-full',(2.2,-5,1.3),(0,0,.95),2.17)
render('polished-face',(.6,-4,1.77),(0,-.025,1.53),.85)
saved=list(body.data.materials)
for slot in body.material_slots:slot.material=original_material
render('uniform-face',(.6,-4,1.77),(0,-.025,1.53),.85)
for slot,mat in zip(body.material_slots,saved):slot.material=mat
render('polished-back',(-2,5,1.4),(0,0,.97),2.17)
camera.location=(2.2,-5,1.3);aim(camera,(0,0,.95));data.ortho_scale=2.17
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Viking_Pulido.blend'),compress=True)
report.update({'geometry_cleanup':cleanup,'surface_material_faces':material_counts,'normal_map':'4096x4096 baked from original high-resolution geometry','comparison':'uniform-face versus polished-face uses identical geometry, pose, camera and light','preview_rendered':True})
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print('VIKING_POLISHED_COMPLETE',json.dumps(report),flush=True)
