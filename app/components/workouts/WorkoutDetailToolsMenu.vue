<template>
  <div class="flex flex-wrap items-center gap-2">
    <UButton
      v-if="editing"
      color="neutral"
      variant="soft"
      class="min-h-11"
      icon="i-heroicons-chevron-left"
      @click="emit('edit')"
    >
      Back to session
    </UButton>
    <UDropdownMenu :items="items">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-heroicons-ellipsis-horizontal"
        class="min-h-11"
        aria-label="Session tools"
      >
        Session tools
      </UButton>
    </UDropdownMenu>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    editing?: boolean
    generating?: boolean
    allowEdit?: boolean
    hasMessages?: boolean
    editLabel?: string
  }>()
  const emit = defineEmits(['view', 'adjust', 'edit', 'regenerate', 'add-messages'])

  const items = computed(() => {
    const actions = [
      { label: 'View session details', icon: 'i-heroicons-eye', onSelect: () => emit('view') },
      {
        label: 'Adjust with coach',
        icon: 'i-heroicons-adjustments-horizontal',
        onSelect: () => emit('adjust')
      }
    ]
    if (props.allowEdit !== false) {
      actions.push({
        label: props.editing ? 'Back to session' : props.editLabel || 'Edit intervals',
        icon: props.editing ? 'i-heroicons-chevron-left' : 'i-heroicons-pencil-square',
        onSelect: () => emit('edit')
      })
    }
    if (props.hasMessages) {
      actions.push({
        label: 'Add coaching cues',
        icon: 'i-heroicons-chat-bubble-left-right',
        onSelect: () => emit('add-messages')
      })
    }
    return [
      actions,
      [
        {
          label: props.generating ? 'Rebuilding session…' : 'Rebuild session',
          icon: 'i-heroicons-arrow-path',
          disabled: props.generating,
          onSelect: () => emit('regenerate')
        }
      ]
    ]
  })
</script>
