import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function RibbonScene() {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer, raf = 0, disposed = false, resizeObserver, visibilityObserver;
    const geometries = [], materials = [];
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
      camera.position.set(0, 0, 17);
      camera.lookAt(0, 0, 0);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      el.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xaaa1d7, 2.3));
      const key = new THREE.DirectionalLight(0xffffff, 4.6); key.position.set(-4, 7, 9); scene.add(key);
      const cool = new THREE.DirectionalLight(0x8ddfff, 3.4); cool.position.set(5, 1, -5); scene.add(cool);
      const rim = new THREE.DirectionalLight(0xffb7ef, 3.1); rim.position.set(-2, -5, 5); scene.add(rim);
      const glowA = new THREE.PointLight(0x9d76ff, 45, 30); glowA.position.set(-2, 2, 4); scene.add(glowA);
      const glowB = new THREE.PointLight(0x73dfff, 36, 26); glowB.position.set(4, -2, 3); scene.add(glowB);
      const group = new THREE.Group(); scene.add(group);

      const palette = [0xb69aff, 0x8ee5ff, 0xf2b9f2];
      const slatMaterials = palette.map((color, i) => {
        const m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.42, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, reflectivity: 1, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.025 });
        materials.push(m); return m;
      });
      const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.72, roughness: 0.16 });
      materials.push(edgeMaterial);
      const curve = (u, lane = 0, phase = 0) => new THREE.Vector3(
        (u - 0.5) * 19.2,
        (0.5 - u) * 6.2 + Math.sin(u * Math.PI * 2.15 + phase) * 1.22 + Math.sin(u * Math.PI * 4.3 + phase * .5) * .3 + lane,
        Math.cos(u * Math.PI * 2.03 + phase) * .72 + Math.sin(u * Math.PI * 3.2 + phase) * .16
      );
      const dummy = new THREE.Object3D();
      const slatGeo = new THREE.BoxGeometry(0.105, 1.5, 0.105);
      geometries.push(slatGeo);
      const strands = [
        { lane: .12, phase: .05, count: 155, width: 1.18, twist: 1.2, scale: 1 },
        { lane: -.17, phase: 1.4, count: 151, width: .76, twist: 1.35, scale: .82 },
        { lane: .34, phase: 2.65, count: 145, width: .54, twist: 1.55, scale: .7 }
      ];
      const animated = [];
      strands.forEach((strand, strandIndex) => {
        const mesh = new THREE.InstancedMesh(slatGeo, slatMaterials[strandIndex], strand.count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.userData = { strand, strandIndex };
        for (let i = 0; i < strand.count; i++) {
          const u = i / (strand.count - 1), p = curve(u, strand.lane, strand.phase);
          const tangent = curve(Math.min(1, u + .003), strand.lane, strand.phase).sub(curve(Math.max(0, u - .003), strand.lane, strand.phase)).normalize();
          const side = new THREE.Vector3(-tangent.y, tangent.x, .18).normalize();
          side.applyAxisAngle(tangent, Math.sin(u * Math.PI * 2 * strand.twist + strand.phase) * .72 + Math.cos(u * Math.PI * 4 + strand.phase) * .24);
          dummy.position.copy(p).addScaledVector(side, Math.sin(u * Math.PI * 2.5 + strand.phase) * .16);
          dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, side, new THREE.Vector3().crossVectors(tangent, side).normalize()));
          dummy.rotateX(Math.sin(u * 18 + strand.phase) * .11);
          dummy.rotateZ(Math.sin(u * 13 + strand.phase) * .08);
          dummy.scale.set(strand.scale, strand.width * (.82 + .18 * Math.sin(u * 45)), strand.scale);
          dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        }
        group.add(mesh); animated.push(mesh);
      });
      strands.slice(0, 2).forEach((s, idx) => [-.5, .5].forEach(edge => {
        const points = [];
        for (let i = 0; i <= 320; i++) {
          const u = i / 320, p = curve(u, s.lane, s.phase);
          const tangent = curve(Math.min(1, u + .002), s.lane, s.phase).sub(curve(Math.max(0, u - .002), s.lane, s.phase)).normalize();
          const side = new THREE.Vector3(-tangent.y, tangent.x, .18).normalize();
          side.applyAxisAngle(tangent, Math.sin(u * Math.PI * 2 * s.twist + s.phase) * .72 + Math.cos(u * Math.PI * 4 + s.phase) * .24);
          p.addScaledVector(side, edge * s.width * s.scale); p.z += idx * .14 + .16; points.push(p);
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 500, .012, 5, false);
        geometries.push(geo); group.add(new THREE.Mesh(geo, edgeMaterial));
      }));

      const dust = new THREE.Group(); scene.add(dust);
      const dustGeo = new THREE.SphereGeometry(.018, 8, 8); geometries.push(dustGeo);
      for (let i = 0; i < 42; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? 0xa9baff : 0xf1c2f4, transparent: true, opacity: .38 }); materials.push(mat);
        const dot = new THREE.Mesh(dustGeo, mat);
        dot.userData = { x: (Math.random() - .5) * 20, y: (Math.random() - .5) * 8, z: (Math.random() - .5) * 2, phase: Math.random() * Math.PI * 2 }; dust.add(dot);
      }
      const resize = () => {
        if (disposed) return;
        const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight), aspect = w / h;
        renderer.setSize(w, h, false); camera.aspect = aspect;
        // Keep the camera close. The reference artwork deliberately enters/exits the viewport;
        // fitting its entire 20-unit length on a portrait screen made it look tiny.
        const portrait = w < 620;
        camera.fov = portrait ? 39 : 35;
        camera.position.set(0, 0, portrait ? 13.2 : 17.2);
        camera.updateProjectionMatrix();
        camera.lookAt(0, portrait ? 0.15 : 0, 0);
      };
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(el); resize();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const started = performance.now(); let visible = true;
      const draw = now => {
        raf = 0; if (disposed || !visible || reduced) return;
        const t = (now - started) / 1000;
        group.rotation.y = Math.sin(t * .19) * .055;
        group.rotation.z = Math.sin(t * .21) * .018;
        group.position.y = Math.sin(t * .4) * .1;
        animated.forEach((mesh, si) => {
          const s = mesh.userData.strand;
          for (let i = 0; i < s.count; i++) {
            const u = i / (s.count - 1), p = curve(u, s.lane, s.phase);
            const tangent = curve(Math.min(1, u + .003), s.lane, s.phase).sub(curve(Math.max(0, u - .003), s.lane, s.phase)).normalize();
            const side = new THREE.Vector3(-tangent.y, tangent.x, .18).normalize();
            side.applyAxisAngle(tangent, Math.sin(u * Math.PI * 2 * s.twist + s.phase + t * .28) * .72 + Math.cos(u * Math.PI * 4 + s.phase) * .24);
            const normal = new THREE.Vector3().crossVectors(tangent, side).normalize();
            dummy.position.copy(p); dummy.position.y += Math.sin(t * .8 + u * 7 + si) * .055;
            dummy.position.addScaledVector(side, Math.sin(u * Math.PI * 2.5 + s.phase) * .16);
            dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, side, normal));
            dummy.rotateX(Math.sin(u * 18 + s.phase + t * .35) * .11); dummy.rotateZ(Math.sin(u * 13 + s.phase + t * .24) * .08);
            dummy.scale.set(s.scale, s.width * (.82 + .18 * Math.sin(u * 45 + t * .45)), s.scale);
            dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        });
        dust.children.forEach(dot => { const d = dot.userData; dot.position.set(d.x + Math.sin(t * .22 + d.phase) * .16, d.y + Math.cos(t * .28 + d.phase) * .2, d.z); });
        glowA.intensity = 42 + Math.sin(t * .9) * 5; glowB.intensity = 34 + Math.cos(t * .8) * 4;
        camera.lookAt(0, 0, 0); renderer.render(scene, camera);
        raf = requestAnimationFrame(draw);
      };
      visibilityObserver = new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting);
        if (visible && !reduced && !raf) raf = requestAnimationFrame(draw);
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { threshold: 0 });
      visibilityObserver.observe(el);
      if (reduced) renderer.render(scene, camera);
      else if (el.getBoundingClientRect().bottom > 0 && el.getBoundingClientRect().top < window.innerHeight) raf = requestAnimationFrame(draw);
    } catch (error) {
      console.error('HelzerX Cloud 3D scene failed', error);
      el.dataset.webgl = 'unavailable';
      el.innerHTML = '<div class="scene-fallback" aria-hidden="true"></div>';
    }
    return () => {
      disposed = true; cancelAnimationFrame(raf); resizeObserver?.disconnect(); visibilityObserver?.disconnect();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      if (renderer) { renderer.renderLists.dispose(); renderer.dispose(); renderer.domElement.remove(); }
    };
  }, []);
  return <div ref={host} className="real3d-scene ribbon-scene" role="img" aria-label="Cinematic iridescent articulated three-dimensional ribbon with animated polished fins" />;
}