import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function RibbonScene(){
 const host=useRef(null);
 useEffect(()=>{
  const el=host.current;if(!el)return;
  let renderer,raf=0,disposed=false,observer,visibility;
  const geometries=[],materials=[];
  try{
   const scene=new THREE.Scene();
   const camera=new THREE.PerspectiveCamera(34,1,.1,100);camera.position.set(0,.1,12.8);camera.lookAt(0,0,0);
   renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure=1.22;
   el.appendChild(renderer.domElement);
   scene.add(new THREE.HemisphereLight(0xffffff,0xaca4df,2.1));
   const key=new THREE.DirectionalLight(0xffffff,4.4);key.position.set(-3,6,8);scene.add(key);
   const rim=new THREE.DirectionalLight(0x9bdcff,3.1);rim.position.set(5,-1,-4);scene.add(rim);
   const lavender=new THREE.PointLight(0xa58aff,48,25);lavender.position.set(-1,2,3);scene.add(lavender);
   const cyan=new THREE.PointLight(0x72ddff,36,22);cyan.position.set(4,-2,4);scene.add(cyan);
   const rose=new THREE.PointLight(0xffaee7,22,20);rose.position.set(-5,-1,2);scene.add(rose);
   const root=new THREE.Group();scene.add(root);
   const palette=[0x9b83ff,0xc0a0ff,0x8acfff,0x9ae7ff,0xd9c9ff,0xffb7e8,0xafa2ff,0x91baff];
   const mats=palette.map((c,i)=>{const m=new THREE.MeshPhysicalMaterial({color:c,metalness:.43,roughness:.2,clearcoat:1,clearcoatRoughness:.1,side:THREE.DoubleSide,emissive:c,emissiveIntensity:i%3===0?.055:.025});materials.push(m);return m});
   const edgeMat=new THREE.MeshStandardMaterial({color:0xfdfaff,metalness:.55,roughness:.19,transparent:true,opacity:.92});materials.push(edgeMat);
   const curvePoint=(u,offset=0,phase=0)=>new THREE.Vector3(
    (u-.5)*17.2,
    Math.sin(u*Math.PI*2.08+phase)*1.52+Math.sin(u*Math.PI*4.15+phase*.6)*.36+offset,
    Math.cos(u*Math.PI*2.08+phase)*.78+Math.sin(u*Math.PI*3+phase)*.18
   );
   function makeRibbon({offset=0,phase=0,width=1.05,twist=1.8,material=0,depth=0}){
    const segments=320,across=18,positions=[],normals=[],uv=[],indices=[];
    for(let i=0;i<=segments;i++){
     const u=i/segments,p=curvePoint(u,offset,phase);
     const tangent=curvePoint(Math.min(1,u+.001),offset,phase).sub(curvePoint(Math.max(0,u-.001),offset,phase)).normalize();
     let side=new THREE.Vector3(-tangent.y,tangent.x,.18).normalize();
     const roll=Math.sin(u*Math.PI*2*twist+phase)*.85+Math.cos(u*Math.PI*4+phase)*.2;
     const normal=new THREE.Vector3().crossVectors(tangent,side).normalize();
     side.applyAxisAngle(tangent,roll);normal.crossVectors(tangent,side).normalize();
     for(let j=0;j<=across;j++){
      const v=j/across-.5;
      const scallop=Math.sin(u*Math.PI*15+phase)*.035;
      const pos=p.clone().addScaledVector(side,v*(width+scallop)).addScaledVector(normal,Math.sin(v*Math.PI*2+u*9+phase)*.095+depth);
      positions.push(pos.x,pos.y,pos.z);normals.push(normal.x,normal.y,normal.z);uv.push(u,j/across);
      if(i<segments&&j<across){const a=i*(across+1)+j,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1)}
     }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();geometries.push(g);
    const mesh=new THREE.Mesh(g,mats[material]);mesh.userData={phase,offset,baseY:0};mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    // Fine, continuous metallic piping along both edges makes the folded strip read as a manufactured 3D object.
    for(const edge of [-.5,.5]){
     const pts=[];for(let i=0;i<=200;i++){const u=i/200,p=curvePoint(u,offset,phase);const tangent=curvePoint(Math.min(1,u+.001),offset,phase).sub(curvePoint(Math.max(0,u-.001),offset,phase)).normalize();let side=new THREE.Vector3(-tangent.y,tangent.x,.18).normalize();side.applyAxisAngle(tangent,Math.sin(u*Math.PI*2*twist+phase)*.85+Math.cos(u*Math.PI*4+phase)*.2);p.addScaledVector(side,edge*width).z+=depth;pts.push(p)}
     const lineGeo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),400,.012,5,false);geometries.push(lineGeo);root.add(new THREE.Mesh(lineGeo,edgeMat));
    }
   }
   // Broad interwoven strips replace the tiny repeated blocks: this is the hero object, not a small decoration.
   makeRibbon({offset:.05,phase:.15,width:1.25,twist:1.2,material:0,depth:.18});
   makeRibbon({offset:.3,phase:1.45,width:.82,twist:1.55,material:2,depth:-.06});
   makeRibbon({offset:-.28,phase:2.75,width:.66,twist:1.4,material:5,depth:-.3});
   makeRibbon({offset:.08,phase:4.15,width:.43,twist:1.75,material:1,depth:.38});
   // Floating luminous dust and a soft atmospheric veil.
   const motes=new THREE.Group();scene.add(motes);
   for(let i=0;i<100;i++){const g=new THREE.SphereGeometry(i%9===0?.024:.011,8,8);geometries.push(g);const m=new THREE.MeshBasicMaterial({color:i%4===0?0xffc4ed:0x9bcaff,transparent:true,opacity:.7});materials.push(m);const dot=new THREE.Mesh(g,m);dot.userData={x:(Math.random()-.5)*18,y:(Math.random()-.5)*8,z:(Math.random()-.5)*2,phase:Math.random()*6.28,speed:.3+Math.random()*.6};motes.add(dot)}
   const haze=new THREE.Mesh(new THREE.PlaneGeometry(20,11),new THREE.MeshBasicMaterial({color:0xdedaff,transparent:true,opacity:.16,depthWrite:false}));haze.position.z=-2.8;scene.add(haze);geometries.push(haze.geometry);materials.push(haze.material);
   const resize=()=>{if(disposed)return;const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const narrow=w<620;camera.position.z=narrow?16.7:12.8;camera.position.x=narrow?.25:0;camera.lookAt(0,0,0)};
   observer=new ResizeObserver(resize);observer.observe(el);resize();
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const start=performance.now();let active=true;
   visibility=new IntersectionObserver(entries=>{active=entries.some(e=>e.isIntersecting);if(active&&!reduced&&!raf)raf=requestAnimationFrame(draw);if(!active&&raf){cancelAnimationFrame(raf);raf=0}});visibility.observe(el);
   const draw=(now)=>{raf=0;if(disposed||!active||reduced)return;const t=(now-start)/1000;raf=requestAnimationFrame(draw);
    root.rotation.y=Math.sin(t*.19)*.12;root.rotation.z=Math.sin(t*.24)*.045;root.position.y=Math.sin(t*.47)*.14;
    root.children.forEach((obj,i)=>{if(obj.geometry?.type==='BufferGeometry'&&obj.userData.phase!==undefined){obj.position.y=Math.sin(t*.65+obj.userData.phase)*.09;obj.rotation.z=Math.sin(t*.31+obj.userData.phase)*.018}});
    motes.children.forEach(m=>{const d=m.userData;m.position.set(d.x+Math.sin(t*d.speed*.18+d.phase)*.22,d.y+Math.cos(t*d.speed*.22+d.phase)*.23,d.z)});
    lavender.intensity=44+Math.sin(t*1.1)*6;cyan.intensity=33+Math.cos(t*.9)*5;camera.position.x=(window.innerWidth<620?.25:0)+Math.sin(t*.14)*.14;camera.lookAt(0,0,0);renderer.render(scene,camera);
   };
   if(reduced)renderer.render(scene,camera);else if(el.getBoundingClientRect().bottom>0&&el.getBoundingClientRect().top<window.innerHeight)raf=requestAnimationFrame(draw);
  }catch(error){console.error('HelzerX 3D scene failed to initialize',error);el.dataset.webgl='unavailable';el.innerHTML='<div class="scene-fallback" aria-hidden="true"></div>'}
  return()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();visibility?.disconnect();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());if(renderer){renderer.renderLists.dispose();renderer.dispose();renderer.domElement.remove()}};
 },[]);
 return <div ref={host} className="real3d-scene ribbon-scene" role="img" aria-label="Large animated interwoven iridescent three-dimensional ribbons"/>;
}