import {useEffect,useRef} from 'react';
import * as THREE from 'three';
export default function ServerScene(){
 const host=useRef(null);
 useEffect(()=>{
  const el=host.current;if(!el)return;
  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050810,.035);
  const camera=new THREE.PerspectiveCamera(35,1,.1,80);camera.position.set(0,1.8,10);camera.lookAt(0,.35,0);
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;el.appendChild(renderer.domElement);
  const root=new THREE.Group();scene.add(root);
  scene.add(new THREE.HemisphereLight(0xabcaff,0x090d18,2.3));
  const key=new THREE.DirectionalLight(0xdbeaff,4.5);key.position.set(-4,7,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
  const blue=new THREE.PointLight(0x168cff,24,10);blue.position.set(2,1,2);scene.add(blue);
  const cyan=new THREE.PointLight(0x53f2e0,13,8);cyan.position.set(-3,1,1);scene.add(cyan);
  const mat=(color,metalness,roughness,extra={})=>new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
  const dark=mat(0x080d16,.5,.34),metal=mat(0x39465c,.88,.24),panel=new THREE.MeshPhysicalMaterial({color:0x101b2d,metalness:.7,roughness:.19,clearcoat:1,clearcoatRoughness:.12}),trim=mat(0x8296b4,.82,.2);
  const led=new THREE.MeshStandardMaterial({color:0xb9ddff,emissive:0x187cff,emissiveIntensity:4}),mint=new THREE.MeshStandardMaterial({color:0xa7ffe7,emissive:0x20ffc0,emissiveIntensity:3});
  const box=(w,h,d,m,x,y,z,parent=root)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o};
  box(4.5,2.72,1.75,dark,0,0,0);box(4.4,2.62,1.65,metal,0,0,.03);box(4.28,2.48,1.5,dark,0,0,.1);
  for(let i=0;i<3;i++){const y=.77-i*.78;box(4.15,.68,1.42,trim,0,y,.17);box(4.06,.56,1.34,panel,0,y,.23);box(3.82,.36,.035,dark,0,y,.94);box(3.82,.025,.04,trim,0,y+.22,.965);box(3.82,.025,.04,trim,0,y-.22,.965);
   for(let j=0;j<20;j++)box(.045,.22,.012,trim,-1.76+j*.18,y,.967);
   for(let j=0;j<4;j++){box(.17,.27,.045,metal,1.05+j*.24,y,.99);box(.11,.018,.012,trim,1.08+j*.24,y+.08,1.02)}
   box(.08,.17,.055,led,-1.72,y,.99);box(.04,.04,.03,mint,-1.49,y,.99);
   for(let j=0;j<3;j++)box(.024,.024,.025,j===1?mint:led,-1.3+j*.09,y,.99);
   box(.08,.42,.09,trim,-2.02,y,.9);box(.08,.42,.09,trim,2.02,y,.9);
  }
  const side=new THREE.Group();side.position.set(1.68,.04,-.64);side.rotation.y=-.24;root.add(side);box(1.08,2.24,.52,metal,0,0,0,side);box(.98,2.1,.08,dark,0,0,.29,side);
  for(let i=0;i<13;i++){box(.72,.045,.025,trim,0,.86-i*.145,.35,side);box(.04,.035,.025,i%3===0?mint:led,-.34,.86-i*.145,.39,side)}
  for(const x of [-1.7,1.7])for(const z of [-.5,.55]){box(.32,.12,.32,dark,x,-1.42,z);box(.24,.025,.24,led,x,-1.49,z)}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),mat(0x090d16,.7,.3));floor.rotation.x=-Math.PI/2;floor.position.y=-1.56;floor.receiveShadow=true;scene.add(floor);
  const cloud=new THREE.Group();cloud.position.set(-.12,2.32,-.28);root.add(cloud);
  const cloudMat=new THREE.MeshPhysicalMaterial({color:0x4f91ff,emissive:0x063a9b,emissiveIntensity:.9,metalness:.14,roughness:.24,clearcoat:1,transparent:true,opacity:.9});
  [[-.8,0,.62],[-.35,.35,.76],[.3,.43,.85],[.82,.12,.65],[.34,-.02,.68],[-.32,-.1,.6]].forEach(([x,y,s])=>{const m=new THREE.Mesh(new THREE.SphereGeometry(s,32,24),cloudMat);m.position.set(x,y,0);m.scale.set(1,.82,.78);m.castShadow=true;cloud.add(m)});
  const glow=new THREE.Mesh(new THREE.SphereGeometry(1.2,32,20),new THREE.MeshBasicMaterial({color:0x61baff,wireframe:true,transparent:true,opacity:.075}));glow.scale.set(1.4,.7,.7);cloud.add(glow);
  const orbit=new THREE.Mesh(new THREE.TorusGeometry(3.05,.008,8,180),new THREE.MeshBasicMaterial({color:0x388eff,transparent:true,opacity:.68}));orbit.rotation.x=1.18;orbit.position.y=.2;root.add(orbit);
  const orbit2=new THREE.Mesh(new THREE.TorusGeometry(2.68,.006,8,160),new THREE.MeshBasicMaterial({color:0x6be8ff,transparent:true,opacity:.32}));orbit2.rotation.x=1.32;orbit2.rotation.y=.55;root.add(orbit2);
  const particles=new THREE.Group();root.add(particles);
  for(let i=0;i<68;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(i%8===0?.026:.012,8,8),new THREE.MeshBasicMaterial({color:i%5===0?0x8affdf:0x78baff}));m.userData={a:Math.random()*6.28,r:2.2+Math.random()*2.1,s:.35+Math.random()*.8,y:-.8+Math.random()*3.9};particles.add(m)}
  const haze=new THREE.Mesh(new THREE.PlaneGeometry(8,3),new THREE.MeshBasicMaterial({color:0x2054ad,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false}));haze.position.set(0,-1.1,-1);root.add(haze);
  let raf=0,disposed=false;const clock=new THREE.Clock();
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};
  const ro=new ResizeObserver(resize);ro.observe(el);resize();
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw=()=>{if(disposed)return;raf=requestAnimationFrame(draw);const t=clock.getElapsedTime();root.rotation.y=Math.sin(t*.22)*.075;root.position.y=Math.sin(t*.7)*.05;cloud.position.y=2.32+Math.sin(t*.75)*.1;cloud.rotation.y=Math.sin(t*.24)*.12;orbit.rotation.z=t*.12;orbit2.rotation.z=-t*.09;blue.intensity=21+Math.sin(t*1.7)*4;cyan.intensity=11+Math.cos(t*1.2)*3;particles.children.forEach(p=>{const d=p.userData,a=d.a+t*d.s*.22;p.position.set(Math.cos(a)*d.r,d.y+Math.sin(t*d.s+d.a)*.14,Math.sin(a)*d.r*.48)});renderer.render(scene,camera)};
  if(reduce)renderer.render(scene,camera);else draw();
  return()=>{disposed=true;cancelAnimationFrame(raf);ro.disconnect();scene.traverse(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}});renderer.dispose();renderer.domElement.remove()};
 },[]);
 return <div ref={host} className="real3d-scene" role="img" aria-label="Cinematic animated three-dimensional cloud server rack"/>;
}