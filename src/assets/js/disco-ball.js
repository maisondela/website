const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let teardownScene = null;

motionQuery.addEventListener("change", () => {
  if (motionQuery.matches && teardownScene) teardownScene();
});

const POOL_SIZE = 900;
const MOBILE_POOL_SIZE = 300;
const EMITTER_SHARE = 35;
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

  const lightPositions = [
    new THREE.Vector3(3, 2, 4),
    new THREE.Vector3(-3, 1, 3),
    new THREE.Vector3(0, -3, 3),
  ];
  const lightHexes = [0xf04e23, 0xe32384, 0x2f7deb];
  const lightIntensities = [50, 50, 35];

  const ambientLight = new THREE.AmbientLight(0xfaf2e7, 0.7);
  scene.add(ambientLight);
  const shaderLightColors = [];
  for (let i = 0; i < lightHexes.length; i++) {
    const light = new THREE.PointLight(lightHexes[i], lightIntensities[i], 0, 2);
    light.position.copy(lightPositions[i]);
    scene.add(light);
    shaderLightColors.push(
      new THREE.Color(lightHexes[i]).multiplyScalar(lightIntensities[i] / 50)
    );
  }

  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BALL_RADIUS, 2),
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
  const phases = new Float32Array(POOL_SIZE);

  function isEmitter(index) {
    return index % 100 < EMITTER_SHARE;
  }

  const particleGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const tintAttribute = new THREE.BufferAttribute(tints, 3);
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
  const phaseAttribute = new THREE.BufferAttribute(phases, 1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  tintAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  sizeAttribute.setUsage(THREE.DynamicDrawUsage);
  phaseAttribute.setUsage(THREE.DynamicDrawUsage);
  particleGeometry.setAttribute("position", positionAttribute);
  particleGeometry.setAttribute("tint", tintAttribute);
  particleGeometry.setAttribute("alpha", alphaAttribute);
  particleGeometry.setAttribute("size", sizeAttribute);
  particleGeometry.setAttribute("phase", phaseAttribute);

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uLightPositions: { value: lightPositions },
      uLightColors: { value: shaderLightColors },
    },
    vertexShader: [
      "attribute vec3 tint;",
      "attribute float alpha;",
      "attribute float size;",
      "attribute float phase;",
      "uniform float uPixelRatio;",
      "uniform float uTime;",
      "uniform vec3 uLightPositions[3];",
      "uniform vec3 uLightColors[3];",
      "varying vec3 vColor;",
      "varying float vAlpha;",
      "void main() {",
      "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
      "  vec3 lighting = vec3(0.45);",
      "  for (int i = 0; i < 3; i++) {",
      "    vec3 toLight = uLightPositions[i] - position;",
      "    float d2 = dot(toLight, toLight);",
      "    lighting += uLightColors[i] * (14.0 / (1.0 + d2));",
      "  }",
      "  lighting = min(lighting, vec3(1.35));",
      "  float twinkle = 0.7 + 0.3 * sin(uTime * (1.2 + fract(phase * 0.53) * 2.4) + phase * 7.0);",
      "  gl_PointSize = size * uPixelRatio * (300.0 / max(-mvPosition.z, 0.1)) * (0.85 + 0.15 * twinkle);",
      "  gl_Position = projectionMatrix * mvPosition;",
      "  vColor = tint * lighting;",
      "  vAlpha = alpha * twinkle;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "varying vec3 vColor;",
      "varying float vAlpha;",
      "void main() {",
      "  float dist = length(gl_PointCoord - vec2(0.5));",
      "  float edge = smoothstep(0.5, 0.32, dist);",
      "  float core = smoothstep(0.22, 0.0, dist);",
      "  float a = vAlpha * edge;",
      "  if (a < 0.01) discard;",
      "  gl_FragColor = vec4(vColor + core * 0.45, a);",
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
    for (let i = 0; i < POOL_SIZE; i++) {
      if (isEmitter(i)) continue;
      const offset = i * 3;
      if (Math.abs(positions[offset]) > worldWidth * 0.575) {
        positions[offset] = (Math.random() - 0.5) * worldWidth * 1.15;
      }
      if (Math.abs(positions[offset + 1]) > worldHeight * 0.575) {
        positions[offset + 1] = (Math.random() - 0.5) * worldHeight * 1.15;
      }
    }
    positionAttribute.needsUpdate = true;
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

  function finishSpawn(index, burst) {
    const offset = index * 3;
    const color = palette[(Math.random() * palette.length) | 0];
    tints[offset] = color.r;
    tints[offset + 1] = color.g;
    tints[offset + 2] = color.b;
    ages[index] = 0;
    phases[index] = Math.random() * Math.PI * 2;
    if (burst) {
      lifetimes[index] = 1.2 + Math.random() * 1.2;
      baseSizes[index] = 0.085 + Math.random() * 0.1;
    } else if (isEmitter(index)) {
      lifetimes[index] = 2.6 + Math.random() * 2.6;
      baseSizes[index] = 0.05 + Math.random() * 0.06;
    } else {
      lifetimes[index] = 4 + Math.random() * 5;
      baseSizes[index] = 0.03 + Math.random() * 0.075;
    }
    alphas[index] = 0;
    sizes[index] = baseSizes[index];
    tintAttribute.needsUpdate = true;
    phaseAttribute.needsUpdate = true;
  }

  function spawnFromBall(index, burst) {
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
    finishSpawn(index, burst);
  }

  function spawnAmbient(index) {
    const offset = index * 3;
    positions[offset] = (Math.random() - 0.5) * worldWidth * 1.15;
    positions[offset + 1] = (Math.random() - 0.5) * worldHeight * 1.15;
    positions[offset + 2] = (Math.random() - 0.5) * 2.4;
    const drift = 0.04 + Math.random() * 0.12;
    const heading = Math.random() * Math.PI * 2;
    velocities[offset] = Math.cos(heading) * drift;
    velocities[offset + 1] = Math.sin(heading) * drift;
    velocities[offset + 2] = (Math.random() - 0.5) * 0.05;
    finishSpawn(index, false);
  }

  function respawnParticle(index, burst) {
    if (burst || isEmitter(index)) spawnFromBall(index, burst);
    else spawnAmbient(index);
  }

  function updateParticles(delta) {
    for (let i = 0; i < activeCount; i++) {
      ages[i] += delta;
      if (ages[i] >= lifetimes[i]) {
        respawnParticle(i, false);
        continue;
      }
      const offset = i * 3;
      const emitter = isEmitter(i);
      positions[offset] += velocities[offset] * delta;
      positions[offset + 1] += velocities[offset + 1] * delta;
      positions[offset + 2] += velocities[offset + 2] * delta;
      if (emitter) velocities[offset + 1] -= 0.22 * delta;
      const life = ages[i] / lifetimes[i];
      const fadeIn = Math.min(ages[i] / 0.25, 1);
      alphas[i] = (emitter ? 0.85 : 0.65) * fadeIn * (1 - life);
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
    particleMaterial.uniforms.uTime.value += delta * (1 + energy * 3);
    if (particleMaterial.uniforms.uTime.value > 6283.185307) {
      particleMaterial.uniforms.uTime.value -= 6283.185307;
    }
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
    for (let i = 0; i < activeCount; i++) {
      if (isEmitter(i)) respawnParticle(i, true);
    }
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
      const gravityDrift = isEmitter(i) ? 0.11 * age : 0;
      positions[offset] += velocities[offset] * age;
      positions[offset + 1] += (velocities[offset + 1] - gravityDrift) * age;
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
