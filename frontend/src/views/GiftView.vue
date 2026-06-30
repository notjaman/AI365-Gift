<template>
  <main class="gift theme-festival">
    <header class="head">
      <div class="mascot-badge"><img src="/mascot.png" alt="AI 365 mascot" /></div>
      <p class="kicker">AI 365 · Open Day Registration</p>
    </header>

    <!-- form -->
    <form v-if="state === 'form'" class="card" @submit.prevent="submit">
      <h1>Open Day Registration</h1>
      <p class="sub">Fill in your details and add a photo to get your picture with our mascot.</p>
      <input class="field" v-model.trim="name" type="text" placeholder="Name" required />
      <input class="field" v-model.trim="email" type="email" placeholder="Email" required />
      <input class="field" v-model.trim="phone" type="tel" placeholder="Phone number" required />
      <button type="button" class="file" :class="{ filled: photo }" @click="chooser = true">
        <span class="file-ico">📷</span>
        <span class="file-text">{{ photo ? photo.name : 'Add a photo' }}</span>
      </button>
      <!-- single entrypoint: tap opens camera-or-gallery, both feed onPhoto -->
      <input ref="camInput" class="hidden-file" type="file" accept="image/*" capture="environment" @change="onPhoto" />
      <input ref="galInput" class="hidden-file" type="file" accept="image/*" @change="onPhoto" />

      <div v-if="chooser" class="sheet" @click.self="chooser = false">
        <div class="sheet-card">
          <p class="sheet-title">Add your photo</p>
          <button type="button" class="btn-primary" @click="pick(camInput)">📷 Take a photo</button>
          <button type="button" class="btn-soft" @click="pick(galInput)">🖼️ Choose from gallery</button>
          <button type="button" class="link" @click="chooser = false">Cancel</button>
        </div>
      </div>
      <button class="btn-primary" type="submit" :disabled="!photo">Generate my photo</button>
    </form>

    <!-- loading: walk through the n8n workflow nodes so the wait feels alive -->
    <div v-else-if="state === 'loading'" class="card">
      <p class="dialog-kicker">⚙ n8n workflow running</p>
      <h1 class="loading-title">Crafting your photo…</h1>
      <button type="button" class="vid-wrap" @click="expandVid" title="Tap to enlarge">
        <video ref="videoEl" class="flow-vid" src="/n8n-flow.mp4" autoplay muted playsinline
               @loadedmetadata="syncVid" @timeupdate="onVidTime" />
        <span class="vid-zoom">⤢ tap to enlarge</span>
      </button>
      <ol class="flow">
        <li v-for="(s, i) in steps" :key="i" class="node"
            :class="{ done: i < step, active: i === step }">
          <span class="node-dot">{{ i < step ? '✓' : s.ico }}</span>
          <span class="node-label">{{ s.label }}</span>
          <span v-if="i === step" class="node-spin" />
        </li>
      </ol>
      <p class="sub">~1 min · powered by an n8n automation</p>
    </div>

    <!-- result -->
    <div v-else-if="state === 'result'" class="card">
      <p class="dialog-kicker">All done</p>
      <h1>You did it!</h1>
      <img class="result" :src="imageUrl" alt="You hugging the mascot" />
      <button class="btn-primary" @click="download">Download</button>
      <button class="link" @click="reset">Start over</button>
    </div>

    <!-- error -->
    <div v-else class="card">
      <div class="err-ico">{{ isPhotoError ? '🖼️' : '⚠️' }}</div>
      <p class="dialog-kicker err">{{ isPhotoError ? 'Photo problem' : 'Oops' }}</p>
      <h1>{{ isPhotoError ? 'That photo won’t work' : 'Something went wrong' }}</h1>
      <p class="sub">{{ errorMsg }}</p>
      <button v-if="isPhotoError" class="btn-primary" @click="changePhoto">Choose another photo</button>
      <button v-else class="btn-primary" @click="submit">Retry</button>
      <button class="link" @click="reset">Start over</button>
    </div>
  </main>
</template>

<script setup>
import { ref, watch } from 'vue'
import { generateGift, probeAccepted } from '../api.js'

const state = ref('form') // form | loading | result | error
const name = ref('')
const email = ref('')
const phone = ref('')
const photo = ref(null)
const imageUrl = ref('')
const errorMsg = ref('')
const isPhotoError = ref(false)
const chooser = ref(false)
const camInput = ref(null)
const galInput = ref(null)

function pick(el) {
  chooser.value = false
  el?.click()
}

// n8n workflow nodes shown during the wait. ponytail: these are a timed
// estimate, not live progress — n8n returns one response with no progress
// stream. Swap `runSteps` for SSE/polling if you ever emit real node events.
const steps = [
  { ico: '🔗', label: 'Connecting to n8n webhook' },
  { ico: '📊', label: 'Storing your details' },
  { ico: '⬆️', label: 'Uploading your photo' },
  { ico: '✍️', label: 'Writing the mascot scene prompt' },
  { ico: '🎨', label: 'Generating your hug with the mascot' },
  { ico: '⬇️', label: 'Downloading the result' },
  { ico: '📧', label: 'Emailing your photo' },
]
const step = ref(0)
let stepTimer = null

// The "Generating" node holds all the timing variance, so park on it until the
// real response arrives instead of guessing its duration. Walk the fast pre-gen
// nodes on their (near-constant) real timings, hold on GEN_STEP, then flash the
// short tail (download/email) once the image is ready.
const GEN_STEP = 4
const PRE = [2, 2, 1, 2] // seconds for nodes 0..3, calibrated from a real n8n run
// ponytail: pre-gen timings must land exactly on the generating node
if (PRE.length !== GEN_STEP) throw new Error('flow PRE/GEN_STEP mismatch')

function runSteps() {
  step.value = 0
  const tick = () => {
    if (state.value !== 'loading' || step.value >= GEN_STEP) return // hold on gen / bail if left loading
    stepTimer = setTimeout(() => { step.value++; tick() }, PRE[step.value] * 1000)
  }
  tick()
}
function stopSteps() { clearTimeout(stepTimer); stepTimer = null }

// Keep the n8n recording's playhead matched to the current node. Marks are the
// timestamps (s) each node starts in the video, from the recorded run.
const videoEl = ref(null)
const VID_MARKS = [0, 2, 4, 4.8, 6, 46.8, 52]
if (VID_MARKS.length !== steps.length) throw new Error('flow VID_MARKS/steps mismatch')
const GEN_LOOP_END = VID_MARKS[GEN_STEP + 1] // loop the generating segment until we advance

function syncVid() {
  const v = videoEl.value
  if (!v || state.value !== 'loading') return
  v.currentTime = VID_MARKS[step.value] ?? 0
  v.play?.()
}
watch(step, syncVid)

// Native fullscreen on the existing element — keeps the step-sync running.
// iOS Safari only fullscreens <video> via webkitEnterFullscreen.
function expandVid() {
  const v = videoEl.value
  if (!v) return
  if (v.requestFullscreen) v.requestFullscreen()
  else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen()
}

function onVidTime() {
  const v = videoEl.value
  if (v && state.value === 'loading' && step.value === GEN_STEP && v.currentTime >= GEN_LOOP_END - 0.15) {
    v.currentTime = VID_MARKS[GEN_STEP] // hold on the generating footage
  }
}

// Image is ready: stop holding and run the tail nodes quickly to completion.
async function finishSteps() {
  stopSteps()
  if (step.value < GEN_STEP) step.value = GEN_STEP // gen finished early — catch up
  while (step.value < steps.length - 1) {
    if (state.value !== 'loading') return // bail if an error/reset took over
    step.value++
    await new Promise((r) => setTimeout(r, 650))
  }
  await new Promise((r) => setTimeout(r, 1800)) // linger on email node → last video frame shows
}

function onPhoto(e) {
  photo.value = e.target.files[0] ?? null
}

async function submit() {
  state.value = 'loading'
  step.value = 0 // hold on "Connecting to n8n webhook", don't march yet
  try {
    const req = generateGift({
      name: name.value, email: email.value, phone: phone.value, photo: photo.value,
    })
    // Don't play the flow until the webhook actually accepts the request. A
    // fast rejection (unreachable/404) skips the fake march and surfaces below.
    const probe = await probeAccepted(req)
    if (probe === 'failed') await req // throw the connection error into catch
    runSteps() // accepted (or already done) → now play the n8n flow
    const { image_url } = await req
    imageUrl.value = image_url
    await finishSteps()
    state.value = 'result'
  } catch (err) {
    errorMsg.value = err.message || 'Please try again.'
    // ponytail: keyword heuristic to pick the photo-specific error screen;
    // tighten to an error code if n8n ever sends one.
    isPhotoError.value = /file type|unsupported|photo|image/i.test(errorMsg.value)
    state.value = 'error'
  } finally {
    stopSteps()
  }
}

// Bad photo → back to the form, keep their details, drop just the photo.
function changePhoto() {
  photo.value = null
  isPhotoError.value = false
  state.value = 'form'
}

// `download` attr is ignored for cross-origin URLs, so fetch a blob and
// download via an object URL. Falls back to opening the image if fetch is
// blocked by CORS (then the user can long-press / save manually).
async function download() {
  try {
    const blob = await (await fetch(imageUrl.value)).blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ai365-hug.png'
    document.body.appendChild(a) // some browsers ignore .click() on a detached node
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    window.open(imageUrl.value, '_blank')
  }
}

function reset() {
  name.value = ''; email.value = ''; phone.value = ''
  photo.value = null; imageUrl.value = ''; errorMsg.value = ''; isPhotoError.value = false
  state.value = 'form'
}
</script>

<style scoped>
/* ── festival theme tokens (matches the kiosk) ── */
.theme-festival {
  --head: 'Fredoka', sans-serif;
  --body: 'Nunito', sans-serif;
  --ink: #4a3526;
  --title: #2c2433;
  --muted: #a07f66;
  --accent: #f26219;
  --accent-soft: rgba(242, 98, 25, 0.18);
  --card-bg: #ffffff;
  --field-border: 2px solid #f1ddc7;
  --btn-bg: linear-gradient(135deg, #ff8334, #ef5a12);
  --btn-shadow: 0 9px 0 #c4480f, 0 14px 22px rgba(216, 72, 24, 0.32);
  --btn-shadow-active: 0 3px 0 #c4480f, 0 7px 12px rgba(216, 72, 24, 0.3);
  --card-shadow: 0 16px 36px rgba(180, 90, 30, 0.15);
}

.gift {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 32px 20px;
  font-family: var(--body);
  color: var(--ink);
  background: radial-gradient(120% 95% at 50% -20%, #fffdf9 0%, #fff1e0 46%, #ffdfc2 100%);
}

/* ── header ── */
.head { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.mascot-badge {
  width: 104px; height: 104px; border-radius: 50%; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: var(--card-bg);
  box-shadow: 0 0 0 6px #fff, 0 12px 26px rgba(120, 60, 20, 0.3);
}
.mascot-badge img { width: 112%; height: 112%; object-fit: cover; object-position: 50% 42%; }
.kicker {
  font: 700 13px/1 var(--head); letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--accent);
}

/* ── card ── */
.card {
  width: 100%; max-width: 420px;
  display: flex; flex-direction: column; gap: 14px;
  text-align: center;
  background: var(--card-bg);
  border-radius: 26px;
  padding: 30px 26px;
  box-shadow: var(--card-shadow);
  animation: pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pop { 0% { transform: scale(0.94); } 60% { transform: scale(1.02); } 100% { transform: scale(1); } }
h1 { font: 700 30px/1.1 var(--head); margin: 0; color: var(--title); }
.loading-title { font-size: 24px; }
.sub { margin: -4px 0 6px; font: 600 15px/1.4 var(--body); color: var(--muted); }
.dialog-kicker {
  font: 700 14px/1 var(--head); letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--accent); margin: 0;
}
.dialog-kicker.err { color: #c4480f; }
.err-ico { font-size: 46px; line-height: 1; margin-bottom: 2px; }

/* ── fields ── */
.field {
  width: 100%; padding: 16px 18px; font: 600 16px var(--body);
  border-radius: 16px; border: var(--field-border); background: #fff; color: var(--ink);
  outline: none; transition: border-color 0.18s, box-shadow 0.18s;
}
.field::placeholder { color: color-mix(in srgb, var(--muted) 85%, transparent); }
.field:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }

/* ── file picker ── */
.hidden-file { display: none; }
.file {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 16px; border: 2px dashed #f1ddc7; border-radius: 16px;
  cursor: pointer; color: var(--muted); font: 600 15px var(--body); background: #fff;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}

/* ── photo chooser sheet ── */
.sheet {
  position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end;
  justify-content: center; background: rgba(0, 0, 0, 0.45);
  animation: fade 0.18s ease;
}
.sheet-card {
  width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 12px;
  background: var(--card-bg); border-radius: 24px 24px 0 0; padding: 24px 22px 28px;
  box-shadow: 0 -10px 30px rgba(120, 60, 20, 0.22);
  animation: rise 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.sheet-title {
  margin: 0 0 2px; text-align: center;
  font: 700 18px var(--head); color: var(--title);
}
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(100%); } }
.file:hover { border-color: var(--accent); }
.file.filled { border-style: solid; border-color: var(--accent); color: var(--title); background: #fff7f0; }
.file input { display: none; }
.file-ico { font-size: 20px; }
.file-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }

/* ── buttons ── */
.btn-primary {
  margin-top: 4px; width: 100%; padding: 17px; border: none; border-radius: 16px;
  cursor: pointer; font: 700 19px/1 var(--head); letter-spacing: 0.05em; color: #fff;
  background: var(--btn-bg); box-shadow: var(--btn-shadow);
  transition: transform 0.1s, box-shadow 0.1s, filter 0.15s; touch-action: manipulation;
}
.btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.btn-primary:active:not(:disabled) { transform: translateY(6px); box-shadow: var(--btn-shadow-active); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-soft {
  width: 100%; padding: 15px; border: 2px solid var(--accent); border-radius: 16px;
  cursor: pointer; font: 700 16px var(--head); color: var(--accent); background: #fff;
  transition: background 0.15s;
}
.btn-soft:hover { background: #fff7f0; }
.link {
  margin-top: 2px; border: none; background: none; cursor: pointer;
  font: 700 14px var(--body); color: var(--muted);
}
.link:hover { color: var(--accent); }

/* ── result image ── */
.result {
  width: 100%; border-radius: 18px; display: block;
  box-shadow: 0 10px 24px rgba(120, 60, 20, 0.22);
}

/* ── n8n workflow flow ── */
.vid-wrap {
  position: relative; display: block; width: 100%; padding: 0; border: none;
  background: none; cursor: zoom-in; border-radius: 14px; margin: 4px 0 2px;
}
.flow-vid {
  width: 100%; border-radius: 14px; display: block;
  background: #1a1a22; box-shadow: 0 8px 20px rgba(120, 60, 20, 0.18);
}
.vid-zoom {
  position: absolute; right: 8px; bottom: 8px;
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 999px;
  font: 700 11px/1 var(--head); letter-spacing: 0.04em; color: #fff;
  background: rgba(0, 0, 0, 0.55); pointer-events: none;
}
.flow {
  list-style: none; margin: 6px 0; padding: 0;
  display: flex; flex-direction: column; gap: 0; text-align: left;
}
.node {
  position: relative; display: flex; align-items: center; gap: 12px;
  padding: 11px 0 11px 4px;
  opacity: 0.45; transition: opacity 0.35s;
}
/* connector line between node dots */
.node:not(:last-child)::before {
  content: ''; position: absolute; left: 18px; top: 34px; bottom: -6px;
  width: 2px; background: var(--field-border, #f1ddc7);
}
.node.done, .node.active { opacity: 1; }
.node-dot {
  flex: none; width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; background: #fff7f0; border: 2px solid #f1ddc7;
  transition: background 0.3s, border-color 0.3s;
}
.node.done .node-dot { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 800; }
.node.active .node-dot {
  border-color: var(--accent); color: var(--accent);
  animation: nodepulse 1.1s ease-in-out infinite;
}
@keyframes nodepulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--accent-soft); }
  50% { box-shadow: 0 0 0 7px var(--accent-soft); }
}
.node-label { font: 600 14.5px/1.2 var(--body); color: var(--ink); }
.node.active .node-label { color: var(--title); }
.node-spin {
  flex: none; margin-left: auto; width: 16px; height: 16px;
  border: 3px solid var(--accent-soft); border-top-color: var(--accent);
  border-radius: 50%; animation: spin 0.8s linear infinite;
}

/* ── spinner ── */
.spinner {
  width: 46px; height: 46px; margin: 8px auto 4px;
  border: 5px solid var(--accent-soft); border-top-color: var(--accent);
  border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
