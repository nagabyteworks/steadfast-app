import 'bootstrap'
import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { FontAwesomeIcon } from './font-awesome'
import { initializeProductionAccount } from './api/productionAccount'
import { usesServerManagedAccount } from './config/profile'

const app = createApp(App)

app.component('font-awesome-icon', FontAwesomeIcon)
app.use(router)

if (usesServerManagedAccount) {
  initializeProductionAccount()
    .then(() => app.mount('#app'), (error) => {
      console.error('Unable to migrate saved broker settings:', error.message)
      document.body.textContent = 'Unable to migrate saved broker settings. Contact the administrator.'
    })
} else {
  app.mount('#app')
}
