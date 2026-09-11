import "./compressor.css";
import "@google/model-viewer";
import initOpenCascade from "opencascade.js/dist/opencascade.full.js";
import openCascadeWasm from "opencascade.js/dist/opencascade.full.wasm?url";

const viewer=document.querySelector("#viewer"), status=document.querySelector("#status"), rebuildButton=document.querySelector("#rebuild"), spinButton=document.querySelector("#spin"), explodeInput=document.querySelector("#explode"), explodeValue=document.querySelector("#explodeValue");
let oc=null,currentObjectUrl=null,spinning=true,timer=null;
const C={shell:"#202833",edge:"#0D1117",steel:"#B8C1C8",dark:"#626D76",light:"#E6EBEE",cu:"#D77935",brass:"#C79A3D",oil:"#B57D16",oil2:"#E0AA32",gasket:"#1597C8",black:"#151A20",red:"#D93232",blue:"#2877D9",yellow:"#E3C43D"};
const rgb=h=>{const v=h.slice(1);return[parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255]};
function rot(rx=0,ry=0,rz=0){const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);return[[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx],[sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-sz*sx],[-sy,cy*sx,cy*cx]]}
function transform(shape,c,s,r=[0,0,0],centered=true){const m=rot(...r),g=new oc.gp_GTrsf_1(),src=centered?[0,0,0]:[.5,.5,.5];for(let i=0;i<3;i++)for(let j=0;j<3;j++)g.SetValue(i+1,j+1,m[i][j]*s[j]);for(let i=0;i<3;i++){const off=m[i][0]*s[0]*src[0]+m[i][1]*s[1]*src[1]+m[i][2]*s[2]*src[2];g.SetValue(i+1,4,c[i]-off)}g.SetForm();return new oc.BRepBuilderAPI_GTransform_2(shape,g,true).Shape()}
const box=(c,s,r=[0,0,0])=>transform(new oc.BRepPrimAPI_MakeBox_2(1,1,1).Shape(),c,s,r,false);
const ell=(c,s,r=[0,0,0])=>transform(new oc.BRepPrimAPI_MakeSphere_1(1).Shape(),c,s,r,true);
function cyl(a,b,r){const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],L=Math.hypot(...d),ax=new oc.gp_Ax2_3(new oc.gp_Pnt_3(...a),new oc.gp_Dir_4(...d));return new oc.BRepPrimAPI_MakeCylinder_3(ax,r,L).Shape()}
function p(parts,name,shape,color){parts.push({name,shape,color})} function pc(parts,n,a,b,r,c){p(parts,n,cyl(a,b,r),c)} function pe(parts,n,c,s,col){p(parts,n,ell(c,s),col)} function pb(parts,n,c,s,col,r=[0,0,0]){p(parts,n,box(c,s,r),col)}
function tube(parts,n,pts,r,col){for(let i=0;i<pts.length-1;i++)pc(parts,`${n}-${i}`,pts[i],pts[i+1],r,col);for(let i=1;i<pts.length-1;i++)pe(parts,`${n}-j${i}`,pts[i],[r,r,r],col)}
function addPart(doc,part,i){const st=oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get(),label=st.NewShape();st.SetShape(label,part.shape);new oc.BRepMesh_IncrementalMesh_2(part.shape,.75,false,.32,false);const mt=oc.XCAFDoc_DocumentTool.VisMaterialTool(label).get(),mat=new oc.XCAFDoc_VisMaterial(),ml=mt.AddMaterial_1(new oc.Handle_XCAFDoc_VisMaterial_2(mat),new oc.TCollection_AsciiString_2(`${part.name}-${i}`));mt.SetShapeMaterial_1(label,ml);const [r,g,b]=rgb(part.color),pbr=new oc.XCAFDoc_VisMaterialPBR();pbr.BaseColor=new oc.Quantity_ColorRGBA_5(r,g,b,1);mat.SetPbrMaterial(pbr)}
function build(){const parts=[],e=+explodeInput.value/100,z=82;
  const top=286+70*e,bottom=-30-18*e;
  pe(parts,"top-shell",[0,0,top],[112,78,37],C.shell);pe(parts,"top-rim",[0,0,top-24],[116,81,8],C.edge);
  tube(parts,"suction",[[-112,-22,top-8],[-145,-22,top-8],[-166,-8,top+2]],4.2,C.cu);tube(parts,"discharge",[[110,20,top],[140,20,top+13],[160,8,top+25]],4.2,C.cu);
  pe(parts,"bottom-shell",[0,0,bottom],[118,82,48],C.shell);pe(parts,"bottom-rim",[0,0,bottom+35],[121,84,7],C.edge);

  const hz=203+45*e;pb(parts,"head-low",[0,0,hz],[96,64,7],C.dark);pb(parts,"gasket",[0,0,hz+6],[100,67,3],C.gasket);pb(parts,"valve-plate",[0,0,hz+12],[94,61,6],C.light);pb(parts,"head-up",[0,0,hz+22],[88,57,8],C.steel);pc(parts,"discharge-post",[18,0,hz+25],[18,0,hz+48],5,C.brass);
  for(const x of[-35,35])for(const y of[-22,22])pc(parts,`bolt-${x}-${y}`,[x,y,hz-5],[x,y,hz+31],2.2,C.dark);

  const px=18*e,cx=-24*e,pz=160+24*e;pc(parts,"cylinder",[cx,0,pz-21],[cx,0,pz+21],31,C.steel);pb(parts,"cylinder-port",[cx+26,0,pz],[15,18,16],C.dark);pc(parts,"piston",[px,0,pz-15],[px,0,pz+15],22,C.light);pc(parts,"ring1",[px,0,pz+7],[px,0,pz+9],22.7,C.dark);pc(parts,"ring2",[px,0,pz+3],[px,0,pz+5],22.7,C.dark);pc(parts,"piston-pin",[px-29,0,pz],[px+29,0,pz],5.2,C.brass);pc(parts,"rod",[7,0,102],[px,0,pz-19],6.2,C.dark);pe(parts,"rod-big",[7,0,102],[10,8,10],C.steel);pe(parts,"rod-small",[px,0,pz-19],[8,7,8],C.steel);

  pc(parts,"shaft",[-78,0,z],[116,0,z],7.2,C.light);pe(parts,"crank-a",[-8,0,z],[11,31,31],C.dark);pe(parts,"crank-b",[12,0,z],[11,31,31],C.dark);pc(parts,"crank-pin",[-3,0,z+19],[17,0,z+19],6.3,C.light);
  const sx=-72*e;pc(parts,"stator",[sx-23,0,z],[sx+23,0,z],40,C.dark);pc(parts,"stator-face",[sx-25,0,z],[sx-21,0,z],42,C.steel);for(let i=0;i<12;i++){const a=i/12*Math.PI*2,y=Math.cos(a)*30,zz=z+Math.sin(a)*30;pc(parts,`coil-${i}`,[sx-28,y,zz],[sx+28,y,zz],3.4,C.cu)}
  const rx=72*e;pc(parts,"rotor",[rx-25,0,z],[rx+25,0,z],25,C.steel);pc(parts,"rotor-core",[rx-23,0,z],[rx+23,0,z],17,C.dark);for(let i=0;i<8;i++){const a=i/8*Math.PI*2,y=Math.cos(a)*21,zz=z+Math.sin(a)*21;pc(parts,`rotor-bar-${i}`,[rx-27,y,zz],[rx+27,y,zz],1.8,C.cu)}
  for(const [i,x] of [[0,-105*e],[1,112*e]]){pc(parts,`bearing-o${i}`,[x-6,0,z],[x+6,0,z],19,C.dark);pc(parts,`bearing-i${i}`,[x-7,0,z],[x+7,0,z],10,C.light)}

  const oz=24-6*e;pe(parts,"oil-pan",[0,0,oz],[96,63,23],C.oil);pe(parts,"oil-surface",[0,0,oz+9],[89,57,9],C.oil2);pc(parts,"pickup-stem",[5,0,oz+5],[5,0,oz+50],3.1,C.brass);pc(parts,"pickup-filter",[5,0,oz+2],[5,0,oz+18],10,C.brass);
  const tx=-142-18*e;pb(parts,"terminal-cover",[tx-14,0,z],[8,62,58],C.shell);pb(parts,"terminal-block",[tx+2,0,z],[22,52,50],C.black);tube(parts,"wire-r",[[tx+20,-10,z-14],[-112,-10,70],[-86,-8,78]],1.8,C.red);tube(parts,"wire-b",[[tx+20,-10,z],[-113,-4,83],[-86,-3,88]],1.8,C.blue);tube(parts,"wire-y",[[tx+20,-10,z+14],[-112,3,95],[-86,4,98]],1.8,C.yellow);

  const fz=-102-25*e;for(const [i,[x,y]] of [[0,[-78,-48]],[1,[78,-48]],[2,[-78,48]],[3,[78,48]]]){pb(parts,`foot-${i}`,[x,y,fz-8],[48,28,8],C.black);pc(parts,`rubber-${i}`,[x,y,fz-1],[x,y,fz+18],12,C.black);for(let j=0;j<7;j++)pe(parts,`spring-${i}-${j}`,[x,y,fz+20+j*5],[12,12,2],C.light)}
  return parts;
}
function exportParts(parts){const doc=new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());parts.forEach((x,i)=>addPart(doc,x,i));const path=`/compressor-${Date.now()}.glb`,w=new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(path),true),ok=w.Perform_2(new oc.Handle_TDocStd_Document_2(doc),new oc.TColStd_IndexedDataMapOfStringString_1(),new oc.Message_ProgressRange_1());if(!ok)throw new Error("OCCT no pudo exportar el compresor a GLB");const glb=oc.FS.readFile(path,{encoding:"binary"});oc.FS.unlink(path);return URL.createObjectURL(new Blob([glb.buffer],{type:"model/gltf-binary"}))}
async function rebuild(){if(!oc)return;rebuildButton.disabled=true;status.textContent="Construyendo piezas B-Rep…";try{await new Promise(r=>requestAnimationFrame(r));const parts=build();status.textContent=`Mallando ${parts.length} piezas…`;await new Promise(r=>requestAnimationFrame(r));const u=exportParts(parts);viewer.src=u;if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=u;status.textContent=`Listo · ${parts.length} piezas · explosión ${explodeInput.value}%`}catch(err){console.error(err);status.textContent=`Error OCCT: ${err instanceof Error?err.message:String(err)}`}finally{rebuildButton.disabled=false}}
function schedule(){explodeValue.textContent=`${explodeInput.value}%`;clearTimeout(timer);timer=setTimeout(rebuild,180)}
rebuildButton.addEventListener("click",rebuild);explodeInput.addEventListener("input",schedule);document.querySelector("#assembled").addEventListener("click",()=>{explodeInput.value="0";schedule()});document.querySelector("#exploded").addEventListener("click",()=>{explodeInput.value="100";schedule()});spinButton.addEventListener("click",()=>{spinning=!spinning;viewer.toggleAttribute("auto-rotate",spinning);spinButton.textContent=spinning?"⏸ Pausar giro":"▶ Girar"});document.querySelector("#frontView").addEventListener("click",()=>{viewer.cameraOrbit="0deg 76deg 185%";viewer.jumpCameraToGoal?.()});document.querySelector("#threeQuarterView").addEventListener("click",()=>{viewer.cameraOrbit="-28deg 68deg 185%";viewer.jumpCameraToGoal?.()});
(async()=>{try{status.textContent="Cargando OpenCascade.js / WebAssembly…";oc=await initOpenCascade({locateFile:path=>path.endsWith(".wasm")?openCascadeWasm:path});rebuildButton.disabled=false;rebuildButton.textContent="↻ Regenerar compresor";await rebuild()}catch(err){console.error(err);status.textContent=`No se pudo iniciar OCCT: ${err instanceof Error?err.message:String(err)}`}})();
