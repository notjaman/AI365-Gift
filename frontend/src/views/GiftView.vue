<template>
  <main class="gift theme-festival">
    <header class="head">
      <div class="mascot-badge"><img src="/mascot.png" alt="AI 365 mascot" /></div>
      <p class="kicker">AI 365 · Hug the Mascot</p>
    </header>

    <!-- form -->
    <form v-if="state === 'form'" class="card" @submit.prevent="submit">
      <h1>Hug the Mascot</h1>
      <p class="sub">Fill in your details and add a photo to get your picture with our mascot.</p>
      <input class="field" v-model.trim="name" type="text" placeholder="Name" required />
      <input class="field" v-model.trim="email" type="email" placeholder="Email" required />
      <input class="field" v-model.trim="phone" type="tel" placeholder="Phone number" required />
      <label class="file" :class="{ filled: photo }">
        <input type="file" accept="image/*" capture="environment" required @change="onPhoto" />
        <span class="file-ico">📷</span>
        <span class="file-text">{{ photo ? photo.name : 'Take or choose a photo' }}</span>
      </label>
      <button class="btn-primary" type="submit" :disabled="!photo">Generate my photo</button>
    </form>

    <!-- loading -->
    <div v-else-if="state === 'loading'" class="card">
      <div class="spinner" />
      <h1 class="loading-title">Generating your photo…</h1>
      <p class="sub">Hang tight — the mascot is getting ready for a hug.</p>
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
import { ref } from 'vue'
import { generateGift } from '../api.js'

const state = ref('form') // form | loading | result | error
const name = ref('')
const email = ref('')
const phone = ref('')
const photo = ref(null)
const imageUrl = ref('')
const errorMsg = ref('')
const isPhotoError = ref(false)

function onPhoto(e) {
  photo.value = e.target.files[0] ?? null
}

async function submit() {
  state.value = 'loading'
  try {
    const { image_url } = await generateGift({
      name: name.value, email: email.value, phone: phone.value, photo: photo.value,
    })
    imageUrl.value = image_url
    state.value = 'result'
  } catch (err) {
    errorMsg.value = err.message || 'Please try again.'
    // ponytail: keyword heuristic to pick the photo-specific error screen;
    // tighten to an error code if n8n ever sends one.
    isPhotoError.value = /file type|unsupported|photo|image/i.test(errorMsg.value)
    state.value = 'error'
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
.file {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 16px; border: 2px dashed #f1ddc7; border-radius: 16px;
  cursor: pointer; color: var(--muted); font: 600 15px var(--body);
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
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

/* ── spinner ── */
.spinner {
  width: 46px; height: 46px; margin: 8px auto 4px;
  border: 5px solid var(--accent-soft); border-top-color: var(--accent);
  border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
