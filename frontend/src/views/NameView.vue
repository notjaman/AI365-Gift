<template>
  <div class="card confetti-pop">
    <img class="logo" src="/logo.png" alt="AI 365" />
    <h1 class="title">AI 365 Lucky Draw</h1>
    <p class="subtitle">Enter your name to spin the wheel 🎡</p>

    <input
      v-model="name"
      class="field"
      type="text"
      placeholder="Your name"
      autocomplete="off"
      :disabled="loading"
      @keyup.enter="submit"
    />

    <button class="btn" :disabled="loading || !name.trim()" @click="submit">
      {{ loading ? 'Checking…' : 'Enter' }}
    </button>

    <p v-if="msg" class="msg error">{{ msg }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { checkName } from '../api.js'
import { store } from '../store.js'

const router = useRouter()
const name = ref('')
const loading = ref(false)
const msg = ref('')

async function submit() {
  const n = name.value.trim()
  if (!n || loading.value) return
  loading.value = true
  msg.value = ''
  try {
    const { status, data } = await checkName(n)
    if (status === 200) {
      store.setName(n)
      router.push({ name: 'wheel' })
      return
    }
    if (status === 409) {
      msg.value = data.previous
        ? `You already claimed: ${data.previous} ✋`
        : 'You already claimed a goodie ✋'
    } else if (status === 400) {
      msg.value = 'Please enter your name.'
    } else {
      msg.value = 'Service unavailable — try again.'
    }
  } catch {
    msg.value = 'Network error — try again.'
  } finally {
    loading.value = false
  }
}
</script>
