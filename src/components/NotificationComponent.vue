<template>
    <div class="notification-container d-flex align-items-center position-relative">
        <button type="button" class="notification-icon me-2 btn btn-link p-0 position-relative border-0"
            :class="{ 'has-notification': showToast }" aria-label="Notices" @click="open = !open">
            <font-awesome-icon icon="bell" />
            <span v-if="systemNotices.length" class="badge rounded-pill bg-danger notice-badge">
                {{ systemNotices.length }}
            </span>
        </button>
        <div v-if="open && systemNotices.length" class="notice-panel shadow border rounded p-2">
            <div v-for="notice in systemNotices" :key="notice" class="small mb-2">{{ notice }}</div>
        </div>
        <div class="notification-message" :class="{ 'show-message': showToast }">
            {{ message || 'No new notifications' }}
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { FontAwesomeIcon } from '@/font-awesome';
import { systemNotices } from '@/stores/globalStore';

const open = ref(false);

const props = defineProps({
    showToast: Boolean,
    message: String,
    notificationSound: Boolean,
});

const emit = defineEmits(['update:showToast', 'update:message']);

const audio = ref(new Audio('/long-pop.wav')); // Preload the audio
const notificationTimer = ref(null);

watch(() => props.showToast, (newShowToast, oldShowToast) => {
    if (newShowToast && newShowToast !== oldShowToast) {
        if (props.notificationSound) {
            playNotificationSound();
        }
        startNotificationTimer();
    }
});

const playNotificationSound = () => {
    try {
        if (audio.value) {
            audio.value.currentTime = 0; // Reset to start
            const playPromise = audio.value.play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Auto-play was prevented, this is normal if no user interaction
                    console.log('Notification sound blocked:', error);
                });
            }
        }
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
};

const startNotificationTimer = () => {
    if (notificationTimer.value) {
        clearTimeout(notificationTimer.value);
    }
    notificationTimer.value = setTimeout(() => {
        clearNotification();
    }, 3000); // Hide after 3 seconds
};

const clearNotification = () => {
    emit('update:showToast', false);
    emit('update:message', '');
    if (audio.value) {
        audio.value.pause();
        audio.value.currentTime = 0;
    }
    if (notificationTimer.value) {
        clearTimeout(notificationTimer.value);
    }
};
</script>

<style scoped>
.notice-badge { position: absolute; top: -6px; right: -10px; font-size: 0.6rem; }
.notice-panel {
    position: absolute; top: 100%; right: 0; z-index: 1050; width: 22rem; max-width: 90vw;
    background: var(--bs-body-bg, #fff); color: var(--bs-body-color, #000);
}
</style>
