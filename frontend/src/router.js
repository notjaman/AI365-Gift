import { createRouter, createWebHashHistory } from 'vue-router'
import NameView from './views/NameView.vue'
import WheelView from './views/WheelView.vue'
import { store } from './store.js'

const routes = [
  { path: '/', name: 'name', component: NameView },
  { path: '/wheel', name: 'wheel', component: WheelView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Guard: /wheel requires a name; otherwise bounce to the name page.
router.beforeEach((to) => {
  if (to.name === 'wheel' && !store.name) {
    return { name: 'name' }
  }
})

export default router
