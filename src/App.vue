<template>
  <header></header>

  <main :class="['container', ['/steadfast', '/'].includes(currentRoute) ? 'bg-color-2' : 'bg-color']">
    <p v-if="productionAccountError" class="alert alert-danger">{{ productionAccountError }}</p>
    <RouterView />
  </main>
</template>

<script>
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import { productionAccountError } from '@/stores/globalStore';

export default {
  name: 'App',
  setup() {
    const route = useRoute();
    const currentRoute = computed(() => route.path);

    return {
      currentRoute,
      productionAccountError
    };
  },
  mounted() {
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add('dark-mode');
    }

    // Listen for changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      if (event.matches) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    });
  }
}
</script>
