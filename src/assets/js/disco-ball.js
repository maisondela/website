const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let teardownScene = null;

motionQuery.addEventListener("change", () => {
  if (motionQuery.matches && teardownScene) teardownScene();
});

const POOL_SIZE = 360;
const MOBILE_POOL_SIZE = 120;
const MOBILE_BREAKPOINT = 768;
const BALL_RADIUS = 0.55;
const THREAD_LENGTH = 1.4;
const FRENZY_DURATION = 3;
const CAMERA_DISTANCE = 6;

function supportsWebgl() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (probe.getContext("webgl2") || probe.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

async function init() {
  if (motionQuery.matches || !supportsWebgl()) return;
  let THREE;
  try {
    THREE = await import("/assets/vendor/three.module.min.js");
  } catch {
    return;
  }
  try {
    setup(THREE);
  } catch {
    return;
  }
}

function setup(THREE) {
  if (motionQuery.matches || teardownScene) return;

  const canvas = document.createElement("canvas");
  canvas.className = "disco-ball-canvas";
  canvas.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_DISTANCE);

  const ambientLight = new THREE.AmbientLight(0xfaf2e7, 0.7);
  const flameLight = new THREE.PointLight(0xf04e23, 50, 0, 2);
  flameLight.position.set(3, 2, 4);
  const magentaLight = new THREE.PointLight(0xe32384, 50, 0, 2);
  magentaLight.position.set(-3, 1, 3);
  const blueLight = new THREE.PointLight(0x2f7deb, 35, 0, 2);
  blueLight.position.set(0, -3, 3);
  scene.add(ambientLight, flameLight, magentaLight, blueLight);

  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BALL_RADIUS, 1),
    new THREE.MeshStandardMaterial({
      color: 0xe9dfe6,
      metalness: 0.95,
      roughness: 0.28,
      flatShading: true,
    })
  );
  scene.add(ball);

  const threadPositions = new Float32Array(6);
  const threadGeometry = new THREE.BufferGeometry();
  const threadAttribute = new THREE.BufferAttribute(threadPositions, 3);
  threadGeometry.setAttribute("position", threadAttribute);
  const thread = new THREE.Line(
    threadGeometry,
    new THREE.LineBasicMaterial({ color: 0x1b1015 })
  );
  thread.frustumCulled = false;
  scene.add(thread);

  const ink = new THREE.Color(0x1b1015);
  const palette = [0xf04e23, 0xe32384, 0xff9fb0, 0x2f7deb].map((hex) =>
    new THREE.Color(hex).lerp(ink, 0.15)
  );

  const positions = new Float32Array(POOL_SIZE * 3);
  const velocities = new Float32Array(POOL_SIZE * 3);
  const tints = new Float32Array(POOL_SIZE * 3);
  const alphas = new Float32Array(POOL_SIZE);
  const sizes = new Float32Array(POOL_SIZE);
  const baseSizes = new Float32Array(POOL_SIZE);
  const ages = new Float32Array(POOL_SIZE);
  const lifetimes = new Float32Array(POOL_SIZE);

  const particleGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const tintAttribute = new THREE.BufferAttribute(tints, 3);
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
  particleGeometry.setAttribute("position", positionAttribute);
  particleGeometry.setAttribute("tint", tintAttribute);
  particleGeometry.setAttribute("alpha", alphaAttribute);
  particleGeometry.setAttribute("size", sizeAttribute);

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: [
      "attribute vec3 tint;",
      "attribute float alpha;",
      "attribute float size;",
      "uniform float uPixelRatio;",
      "varying vec3 vTint;",
      "varying float vAlpha;",
      "void main() {",
      "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
      "  gl_PointSize = size * uPixelRatio * (300.0 / max(-mvPosition.z, 0.1));",
      "  gl_Position = projectionMatrix * mvPosition;",
      "  vTint = tint;",
      "  vAlpha = alpha;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "varying vec3 vTint;",
      "varying float vAlpha;",
      "void main() {",
      "  float dist = length(gl_PointCoord - vec2(0.5));",
      "  float edge = smoothstep(0.5, 0.32, dist);",
      "  float a = vAlpha * edge;",
      "  if (a < 0.01) discard;",
      "  gl_FragColor = vec4(vTint, a);",
      "}",
    ].join("\n"),
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  scene.add(particles);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const anchor = new THREE.Vector2();
  const scratch = new THREE.Vector3();
  const clock = new THREE.Clock();
  const logoElement = document.querySelector(".site-logo");

  let running = false;
  let rafId = 0;
  let contextLost = false;
  let sized = false;
  let viewWidth = 0;
  let viewHeight = 0;
  let worldWidth = 0;
  let worldHeight = 0;
  let activeCount = POOL_SIZE;
  let swingTime = 0;
  let frenzyTime = FRENZY_DURATION;
  let energy = 0;
  let resizeTimer = 0;

  function applySize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === 0 || height === 0) {
      sized = false;
      return;
    }
    viewWidth = width;
    viewHeight = height;
    const isMobile = width <= MOBILE_BREAKPOINT;
    activeCount = isMobile ? MOBILE_POOL_SIZE : POOL_SIZE;
    particleGeometry.setDrawRange(0, activeCount);
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    particleMaterial.uniforms.uPixelRatio.value = dpr;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    worldHeight =
      2 * Math.tan((camera.fov * Math.PI) / 360) * CAMERA_DISTANCE;
    worldWidth = worldHeight * camera.aspect;
    sized = true;
  }

  function updateAnchor() {
    let screenX = viewWidth / 2;
    let screenY = 0;
    if (logoElement) {
      const rect = logoElement.getBoundingClientRect();
      if (rect.width !== 0) {
        screenX = rect.left + rect.width / 2;
        screenY = rect.bottom;
      }
    }
    anchor.x = (screenX / viewWidth - 0.5) * worldWidth;
    anchor.y = -(screenY / viewHeight - 0.5) * worldHeight;
  }

  function updateSwing(delta) {
    updateAnchor();
    swingTime += delta;
    const amplitude = 0.1 + energy * 0.3;
    const angle = Math.sin(swingTime * 1.15) * amplitude;
    ball.position.set(
      anchor.x + Math.sin(angle) * THREAD_LENGTH,
      anchor.y - Math.cos(angle) * THREAD_LENGTH,
      0
    );
    ball.rotation.y += 0.45 * (1 + 7 * energy) * delta;
    ball.rotation.x += 0.06 * delta;
    threadPositions[0] = anchor.x;
    threadPositions[1] = anchor.y;
    threadPositions[2] = 0;
    threadPositions[3] = ball.position.x;
    threadPositions[4] = ball.position.y;
    threadPositions[5] = ball.position.z;
    threadAttribute.needsUpdate = true;
  }

  function respawnParticle(index, burst) {
    scratch.set(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    );
    if (scratch.lengthSq() < 0.001) scratch.set(0, 1, 0);
    scratch.normalize();
    const offset = index * 3;
    positions[offset] = ball.position.x + scratch.x * BALL_RADIUS;
    positions[offset + 1] = ball.position.y + scratch.y * BALL_RADIUS;
    positions[offset + 2] = ball.position.z + scratch.z * BALL_RADIUS;
    const speed = burst
      ? 1.6 + Math.random() * 1.4
      : 0.14 + Math.random() * 0.24;
    velocities[offset] = scratch.x * speed;
    velocities[offset + 1] = scratch.y * speed + (burst ? 0.4 : 0.08);
    velocities[offset + 2] = scratch.z * speed * 0.4;
    const color = palette[(Math.random() * palette.length) | 0];
    tints[offset] = color.r;
    tints[offset + 1] = color.g;
    tints[offset + 2] = color.b;
    ages[index] = 0;
    lifetimes[index] = burst
      ? 1.2 + Math.random() * 1.2
      : 2.6 + Math.random() * 2.6;
    baseSizes[index] = burst
      ? 0.085 + Math.random() * 0.09
      : 0.05 + Math.random() * 0.055;
    alphas[index] = 0;
    sizes[index] = baseSizes[index];
    tintAttribute.needsUpdate = true;
  }

  function updateParticles(delta) {
    for (let i = 0; i < activeCount; i++) {
      ages[i] += delta;
      if (ages[i] >= lifetimes[i]) {
        respawnParticle(i, false);
        continue;
      }
      const offset = i * 3;
      positions[offset] += velocities[offset] * delta;
      positions[offset + 1] += velocities[offset + 1] * delta;
      positions[offset + 2] += velocities[offset + 2] * delta;
      velocities[offset + 1] -= 0.22 * delta;
      const life = ages[i] / lifetimes[i];
      const fadeIn = Math.min(ages[i] / 0.25, 1);
      alphas[i] = 0.85 * fadeIn * (1 - life);
      sizes[i] = baseSizes[i] * (1 - 0.45 * life);
    }
    positionAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
  }

  function tick() {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (!sized) {
      applySize();
      if (!sized) return;
    }
    frenzyTime += delta;
    const remaining = Math.max(0, 1 - frenzyTime / FRENZY_DURATION);
    energy = remaining * remaining;
    updateSwing(delta);
    updateParticles(delta);
    renderer.render(scene, camera);
  }

  function startLoop() {
    if (running || contextLost || document.hidden) return;
    running = true;
    clock.getDelta();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  }

  function onVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySize, 150);
  }

  function onClick(event) {
    if (!sized) return;
    const width = window.innerWidth || viewWidth;
    const height = window.innerHeight || viewHeight;
    pointer.set(
      (event.clientX / width) * 2 - 1,
      -(event.clientY / height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(ball).length === 0) return;
    frenzyTime = 0;
    const burstCount = Math.floor(activeCount * 0.6);
    for (let i = 0; i < burstCount; i++) respawnParticle(i, true);
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    stopLoop();
  }

  function onContextRestored() {
    contextLost = false;
    applySize();
    startLoop();
  }

  applySize();
  if (sized) {
    updateSwing(0);
    for (let i = 0; i < activeCount; i++) {
      respawnParticle(i, false);
      const age = Math.random() * lifetimes[i];
      ages[i] = age;
      const offset = i * 3;
      positions[offset] += velocities[offset] * age;
      positions[offset + 1] += (velocities[offset + 1] - 0.11 * age) * age;
      positions[offset + 2] += velocities[offset + 2] * age;
    }
  }

  document.body.appendChild(canvas);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  teardownScene = () => {
    stopLoop();
    clearTimeout(resizeTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("click", onClick);
    window.removeEventListener("resize", onResize);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    ball.geometry.dispose();
    ball.material.dispose();
    threadGeometry.dispose();
    thread.material.dispose();
    particleGeometry.dispose();
    particleMaterial.dispose();
    renderer.forceContextLoss();
    renderer.dispose();
    canvas.remove();
    teardownScene = null;
  };

  if (!document.hidden) startLoop();
}

function schedule() {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(init, { timeout: 2000 });
  } else {
    setTimeout(init, 200);
  }
}

if (!motionQuery.matches) {
  if (document.readyState === "complete") {
    schedule();
  } else {
    window.addEventListener("load", schedule, { once: true });
  }
}
