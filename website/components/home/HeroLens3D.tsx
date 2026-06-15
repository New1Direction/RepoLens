'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, MeshTransmissionMaterial, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Static assets aren't auto-prefixed with the GitHub Pages basePath, so prefix by hand.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Vee on a disc directly behind the lens — sized to sit fully within the lens
 * silhouette, so he's only ever seen *through* the glass (refracted), never as a
 * bare rectangle. Swap the poster for a transparent cutout later for an even
 * cleaner float.
 */
function VeeDisc() {
  const tex = useTexture(`${BASE}/mascot-poster.jpg`);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[0, 0.02, -0.55]}>
      <circleGeometry args={[1.02, 64]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** The glass lens + its glowing cyan aperture rim. Tilts toward the cursor and
 *  idles with a slow drift. */
function Lens() {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // cursor tilt + a slow idle sway
    const targetY = state.pointer.x * 0.5 + Math.sin(t * 0.35) * 0.12;
    const targetX = -state.pointer.y * 0.4 + Math.cos(t * 0.28) * 0.08;
    const k = 1 - Math.pow(0.0015, delta); // frame-rate-independent damping
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, k);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, k);
    g.position.y = Math.sin(t * 0.6) * 0.04;
  });

  return (
    <group ref={group}>
      {/* the lens: a flattened sphere → a thick magnifying disc */}
      <mesh scale={[1, 1, 0.42]}>
        <sphereGeometry args={[1.12, 64, 64]} />
        <MeshTransmissionMaterial
          transmission={1}
          thickness={1.4}
          roughness={0.04}
          ior={1.45}
          chromaticAberration={0.08}
          anisotropicBlur={0.12}
          distortion={0.25}
          distortionScale={0.35}
          temporalDistortion={0.05}
          samples={6}
          resolution={512}
        />
      </mesh>
      {/* glowing aperture rim — a ring around the lens edge, facing the viewer
          (no rotation: TorusGeometry already lies in the camera-facing plane). */}
      <mesh>
        <torusGeometry args={[1.16, 0.04, 28, 140]} />
        <meshStandardMaterial
          color="#67e8f9"
          emissive="#06b6d4"
          emissiveIntensity={2.6}
          roughness={0.25}
          metalness={0.3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default function HeroLens3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 34 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <pointLight position={[-3, -1, 2]} intensity={0.6} color="#9ec5ff" />
      <Suspense fallback={null}>
        <VeeDisc />
        <Lens />
        {/* Procedural studio env — NO external HDR (keeps zero external calls). */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.2} position={[2.5, 3, 2]} scale={[5, 5, 1]} color="#cfe6ff" />
          <Lightformer form="rect" intensity={1.5} position={[-3.5, 1, 1.5]} scale={[4, 4, 1]} color="#ffdede" />
          <Lightformer form="circle" intensity={2} position={[0, -2.5, 2.5]} scale={4} color="#bcd4ff" />
        </Environment>
      </Suspense>
    </Canvas>
  );
}
