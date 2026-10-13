import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function RibbonScene(){
 const host=useRef(null);
 useEffect(()=>{
  const el=host.current;if(!el)return;
  let renderer,raf=0,disposed=false,observer;
  try{
   const scene=new THREE.Scene();
   const camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.set(0,0,13.8);camera.lookAt(0,0,0);
   renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;el.appendChild(renderer.domElement);
   scene.add(new THREE.HemisphereLight(0xffffff,0xb7b2dc,2.25));
   const key=new THREE.DirectionalLight(0xffffff,3.6);key.position.set(-4,7,8);scene.add(key);
   const lavender=new THREE.PointLight(0xa99aff,36,22);lavender.position.set(0,2,3);scene.add(lavender);
   const cyan=new THREE.PointLight(0x83dfff,27,18);cyan.position.set(3,-2,4);scene.add(cyan);
   const pink=new THREE.PointLight(0xffb8e9,16,15);pink.position.set(-5,-1,2);scene.add(pink);
   const ribbonRoot=new THREE.Group();scene.add(ribbonRoot);
   const colors=[0x9b8cff,0xc3a0ff,0x8bcfff,0x9be8ff,0xd4c4ff,0xffb8e7,0xafa4ff];
   const materials=colors.map((c,i)=>new THREE.MeshPhysicalMaterial({color:c,metalness:.35,roughness:.23,clearcoat:1,clearcoatRoughness:.14,side:THREE.DoubleSide,emissive:c,emissiveIntensity:i%3===0?.045:.018}));
   const edgeMat=new THREE.MeshStandardMaterial({color:0xffffff,metalness:.3,roughness:.22});
   const count=104;
   const path=(u)=>{const x=(u-.5)*15.5;return new THREE.Vector3(x,Math.sin(u*Math.PI*2.05+.3)*1.55+Math.sin(u*Math.PI*4)*.27,Math.cos(u*Math.PI*2.05)*.8)};
   for(let i=0;i<count;i++){
    const u=i/(count-1),p=path(u),next=path(Math.min(1,u+.006)),prev=path(Math.max(0,u-.006)),tangent=next.clone().sub(prev).normalize();
    const mesh=new THREE.Group();mesh.position.copy(p);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),tangent);
    const depth=.22+(Math.sin(i*.19)+1)*.055,width=.32+(Math.sin(i*.13+1)+1)*.11;
    const geo=new THREE.BoxGeometry(.12,width,depth,1,1,1);
    const prism=new THREE.Mesh(geo,materials[i%materials.length]);prism.castShadow=true;prism.receiveShadow=true;prism.rotation.y=.25+Math.sin(i*.12)*.18;prism.rotation.z=(Math.sin(i*.22)*.19)+.18;mesh.add(prism);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(.125,.025,depth+.012),edgeMat);stripe.position.y=width*.42;stripe.position.z=.008;stripe.rotation.copy(prism.rotation);mesh.add(stripe);
    mesh.userData={i,u,phase:i*.18,base:p.clone(),width};ribbonRoot.add(mesh);
   }
   // A second fine filament gives the folded ribbon a layered, refractive silhouette.
   const filamentPoints=[];for(let i=0;i<220;i++){const u=i/219,p=path(u);p.y+=.25;p.z+=.2;filamentPoints.push(p)}
   const filament=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(filamentPoints),400,.012,5,false),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.65}));ribbonRoot.add(filament);
   const halo=new THREE.Mesh(new THREE.PlaneGeometry(17,10),new THREE.MeshBasicMaterial({color:0xe4e2ff,transparent:true,opacity:.18,depthWrite:false}));halo.position.z=-1.9;scene.add(halo);
   const motes=new THREE.Group();scene.add(motes);for(let i=0;i<58;i++){const dot=new THREE.Mesh(new THREE.SphereGeometry(i%7===0?.025:.012,8,8),new THREE.MeshBasicMaterial({color:i%4===0?0xf9c6ed:0x9acbff,transparent:true,opacity:.65}));dot.userData={x:(Math.random()-.5)*16,y:(Math.random()-.5)*7,phase:Math.random()*6.28};motes.add(dot)}
   const resize=()=>{if(disposed)return;const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const narrow=w<620;camera.position.z=narrow?17.5:13.8;camera.position.x=narrow?0:.25;camera.lookAt(0,0,0)};
   observer=new ResizeObserver(resize);observer.observe(el);resize();
   const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const start=performance.now();
   const draw=(now)=>{if(disposed)return;raf=requestAnimationFrame(draw);const t=(now-start)/1000;
    ribbonRoot.rotation.z=Math.sin(t*.24)*.055;ribbonRoot.rotation.y=Math.sin(t*.2)*.09;ribbonRoot.position.y=Math.sin(t*.5)*.11;
    ribbonRoot.children.slice(0,count).forEach((m)=>{const d=m.userData;const wave=Math.sin(t*.9+d.phase)*.08;m.position.y=d.base.y+wave;m.position.z=d.base.z+Math.cos(t*.7+d.phase)*.055;m.rotation.z=Math.sin(t*.45+d.phase)*.025});
    motes.children.forEach((m)=>{const d=m.userData;m.position.set(d.x+Math.sin(t*.18+d.phase)*.15,d.y+Math.cos(t*.22+d.phase)*.18,-.3);});
    camera.position.x=(window.innerWidth<620?0:.25)+Math.sin(t*.16)*.12;camera.lookAt(0,0,0);renderer.render(scene,camera);
   };
   if(reduce)renderer.render(scene,camera);else raf=requestAnimationFrame(draw);
  }catch(error){el.dataset.webgl='unavailable';el.innerHTML='<div class="scene-fallback" aria-hidden="true"></div>'}
  return()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();if(renderer){renderer.renderLists?.dispose();renderer.dispose();renderer.domElement.remove()}};
 },[]);
 return <div ref={host} className="real3d-scene ribbon-scene" role="img" aria-label="Animated iridescent lavender, cyan and pink three-dimensional geometric ribbon"/>;
}