import * as THREE from "https://cdn.skypack.dev/three@0.158.0";

const lerp = (start, end, amount) => start + (end - start) * amount;

export const supportsWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch (err) {
    return false;
  }
};

export function initHeroScene(canvas, container) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
  camera.position.set(0, 0, 8);

  const portalGroup = new THREE.Group();
  scene.add(portalGroup);

  const ambient = new THREE.AmbientLight(0x8fb0ff, 0.8);
  const directional = new THREE.DirectionalLight(0x7cf2d0, 0.9);
  directional.position.set(5, 6, 5);
  scene.add(ambient, directional);

  const portalMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x3f5dff) },
      uColorB: { value: new THREE.Color(0x7cf2d0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        transformed.xy += normal.xy * 0.08 * sin(vUv.y * 6.0 + position.z * 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      void main() {
        float glow = smoothstep(0.2, 1.0, 1.0 - distance(vUv, vec2(0.5)));
        float pulse = 0.5 + 0.5 * sin(uTime * 0.8 + vUv.y * 10.0);
        vec3 color = mix(uColorA, uColorB, vUv.y + pulse * 0.25);
        gl_FragColor = vec4(color, glow * 0.9);
      }
    `,
  });

  const portalGeometry = new THREE.RingGeometry(1.5, 2.4, 64, 32);
  const portal = new THREE.Mesh(portalGeometry, portalMaterial);
  portal.rotation.x = Math.PI / 2.6;
  portalGroup.add(portal);

  const shardGeometry = new THREE.IcosahedronGeometry(0.14, 1);
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0x99a5ff,
    metalness: 0.3,
    roughness: 0.2,
    transparent: true,
    opacity: 0.92,
  });

  const shards = [];
  const shardCount = 120;
  for (let i = 0; i < shardCount; i += 1) {
    const shard = new THREE.Mesh(shardGeometry.clone(), shardMaterial.clone());
    const radius = 2.6 + Math.random() * 1.8;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 2.4;
    shard.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    shard.scale.setScalar(0.6 + Math.random() * 0.9);
    shard.material.color.offsetHSL(Math.random() * 0.1, 0.15, Math.random() * 0.1);
    shard.userData = {
      axis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
      speed: 0.2 + Math.random() * 0.6,
      offset: Math.random() * Math.PI * 2,
      radius,
    };
    shards.push(shard);
    portalGroup.add(shard);
  }

  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 600;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const color = new THREE.Color();

  for (let i = 0; i < particleCount; i += 1) {
    const radius = 3 + Math.random() * 2.6;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 3.2;

    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * radius;

    color.setHSL(0.59 + Math.random() * 0.08, 0.75, 0.6 + Math.random() * 0.2);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  portalGroup.add(particles);

  let pointerTarget = new THREE.Vector2(0, 0);
  const pointer = new THREE.Vector2(0, 0);
  const parallax = { x: 0, y: 0 };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    const width = Math.max(clientWidth, 1);
    const height = Math.max(clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener("resize", resize);

  const handlePointerMove = (event) => {
    const bounds = container.getBoundingClientRect();
    pointerTarget.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointerTarget.y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
  };

  window.addEventListener("pointermove", handlePointerMove);

  let scrollProgress = 0;
  const updateScroll = () => {
    const bounds = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const distance = Math.min(Math.max(-bounds.top / viewportHeight, 0), 1);
    scrollProgress = distance;
    requestAnimationFrame(updateScroll);
  };
  requestAnimationFrame(updateScroll);

  let isRunning = true;
  const clock = new THREE.Clock();

  const animate = () => {
    if (!isRunning) return;
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    pointer.x = lerp(pointer.x, pointerTarget.x, 0.05);
    pointer.y = lerp(pointer.y, pointerTarget.y, 0.05);

    parallax.x = lerp(parallax.x, pointer.x * 0.5, 0.08);
    parallax.y = lerp(parallax.y, pointer.y * 0.35 + scrollProgress * -0.4, 0.08);

    portalGroup.rotation.y = parallax.x * 0.6;
    portalGroup.rotation.x = parallax.y * 0.4;

    shards.forEach((shard, index) => {
      const data = shard.userData;
      const time = elapsed * data.speed + data.offset;
      shard.position.x = Math.cos(time) * data.radius;
      shard.position.z = Math.sin(time) * data.radius;
      shard.rotation.x += delta * 0.6;
      shard.rotation.y += delta * 0.8;
      const hoverPulse = 0.6 + 0.4 * Math.sin(elapsed * 1.4 + index * 0.2);
      shard.scale.setScalar(hoverPulse);
    });

    particles.rotation.y += delta * 0.08;
    particles.rotation.x += delta * 0.03;

    portalMaterial.uniforms.uTime.value = elapsed;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();

  const cleanup = () => {
    isRunning = false;
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", handlePointerMove);
    renderer.dispose();
    portalGeometry.dispose();
    shardGeometry.dispose();
    particleGeometry.dispose();
    portalMaterial.dispose();
    shardMaterial.dispose();
    particleMaterial.dispose();
  };

  return { cleanup };
}
