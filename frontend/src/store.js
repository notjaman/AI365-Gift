import { reactive } from 'vue'

// Lightweight shared store: carries the entered name across the two routes.
export const store = reactive({
  name: '',
  setName(n) {
    this.name = (n || '').trim()
  },
  clear() {
    this.name = ''
  },
})
