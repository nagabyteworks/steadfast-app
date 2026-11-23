<script setup>
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getFlattradeRequestCode } from '@/api/broker';

const route = useRoute();

onMounted(() => {
  const code = getFlattradeRequestCode(route.query);
  window.history.replaceState(window.history.state, '', window.location.pathname);
  if (code) {
    localStorage.removeItem('statusMessage');
    if (window.opener) {
      window.opener.postMessage({ type: 'flattradeReqCode', code }, window.location.origin);
      window.close();
    } else {
      console.error('Broker authorization window has no opener');
    }
  } else {
    console.error('No valid code found in the URL');
  }
});
</script>

<template>
  <div>Redirecting...</div>
</template>
