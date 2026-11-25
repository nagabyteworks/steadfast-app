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
    // The broker's login page can sever window.opener, so also broadcast to same-origin tabs.
    const channel = new BroadcastChannel('flattrade-auth');
    channel.postMessage({ type: 'flattradeReqCode', code });
    channel.close();
    if (window.opener) {
      window.opener.postMessage({ type: 'flattradeReqCode', code }, window.location.origin);
    }
    window.close();
  } else {
    console.error('No valid code found in the URL');
  }
});
</script>

<template>
  <div>Redirecting...</div>
</template>
