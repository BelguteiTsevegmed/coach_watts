<template>
  <section class="notes-editor">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-semibold">{{ title || 'Notes' }}</h2>
      <UButton
        v-if="!isEditing && hasNotes"
        icon="i-heroicons-pencil"
        color="neutral"
        variant="ghost"
        class="min-h-11"
        @click="startEditing"
        >Edit note</UButton
      >
    </div>

    <div v-if="!isEditing && !hasNotes">
      <p class="max-w-prose text-sm text-muted leading-relaxed">
        {{ emptyHint || 'Add anything you want to remember about this day.' }}
      </p>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-heroicons-plus"
        class="mt-4 min-h-11"
        @click="startEditing"
        >Add a note</UButton
      >
    </div>

    <div v-if="!isEditing && hasNotes" class="space-y-3">
      <!-- eslint-disable vue/no-v-html -- markdown-rendered notes -->
      <div
        class="prose prose-sm dark:prose-invert max-w-prose text-default leading-relaxed"
        v-html="renderedNotes"
      />
      <!-- eslint-enable vue/no-v-html -->
      <p v-if="notesUpdatedAt" class="text-xs text-muted">Saved {{ formatDate(notesUpdatedAt) }}</p>
    </div>

    <div v-if="isEditing" class="space-y-4">
      <div class="notes-writing-area rounded-xl border border-default bg-default overflow-hidden">
        <details v-if="editor" class="border-b border-default px-4">
          <summary class="min-h-11 py-3 cursor-pointer text-sm text-muted">Formatting</summary>
          <div class="mb-3 flex flex-wrap gap-1">
            <UButton
              icon="i-lucide-bold"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11"
              aria-label="Bold"
              :aria-pressed="editor?.isActive('bold')"
              :class="{ 'text-primary bg-elevated': editor?.isActive('bold') }"
              @click="
                () => {
                  void editor?.chain().focus().toggleBold().run()
                }
              "
            />
            <UButton
              icon="i-lucide-italic"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11"
              aria-label="Italic"
              :aria-pressed="editor?.isActive('italic')"
              :class="{ 'text-primary bg-elevated': editor?.isActive('italic') }"
              @click="
                () => {
                  void editor?.chain().focus().toggleItalic().run()
                }
              "
            />
            <UButton
              icon="i-lucide-heading-2"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11"
              aria-label="Heading"
              :aria-pressed="editor?.isActive('heading', { level: 2 })"
              :class="{ 'text-primary bg-elevated': editor?.isActive('heading', { level: 2 }) }"
              @click="
                () => {
                  void editor?.chain().focus().toggleHeading({ level: 2 }).run()
                }
              "
            />
            <UButton
              icon="i-lucide-list"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11"
              aria-label="Bullet list"
              :aria-pressed="editor?.isActive('bulletList')"
              :class="{ 'text-primary bg-elevated': editor?.isActive('bulletList') }"
              @click="
                () => {
                  void editor?.chain().focus().toggleBulletList().run()
                }
              "
            />
            <UButton
              icon="i-lucide-list-ordered"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11"
              aria-label="Numbered list"
              :aria-pressed="editor?.isActive('orderedList')"
              :class="{ 'text-primary bg-elevated': editor?.isActive('orderedList') }"
              @click="
                () => {
                  void editor?.chain().focus().toggleOrderedList().run()
                }
              "
            />
            <UButton
              icon="i-lucide-undo"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11"
              aria-label="Undo"
              :disabled="!editor?.can().undo()"
              @click="
                () => {
                  void editor?.chain().focus().undo().run()
                }
              "
            />
          </div>
        </details>
        <EditorContent :editor="editor" class="px-4 py-4" />
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="saving"
          class="min-h-11"
          @click="saveNotes"
          >Save note</UButton
        >
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="saving"
          class="min-h-11"
          @click="cancelEditing"
          >Cancel</UButton
        >
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useEditor, EditorContent } from '@tiptap/vue-3'
  import StarterKit from '@tiptap/starter-kit'
  import Placeholder from '@tiptap/extension-placeholder'
  import TurndownService from 'turndown'
  import { marked } from 'marked'

  const { formatDateTime } = useFormat()

  const props = defineProps<{
    modelValue?: string | null
    notesUpdatedAt?: string | Date | null
    apiEndpoint: string
    title?: string
    emptyHint?: string
  }>()

  // Initialize Turndown for HTML to Markdown conversion
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  })

  const emit = defineEmits<{
    'update:modelValue': [value: string | null]
    'update:notesUpdatedAt': [value: Date | null]
  }>()

  const toast = useToast()

  const isEditing = ref(false)
  const saving = ref(false)

  const hasNotes = computed(() => {
    return props.modelValue && props.modelValue.trim().length > 0
  })

  // Convert markdown to HTML for display
  const renderedNotes = computed(() => {
    if (!props.modelValue) return ''
    return marked.parse(props.modelValue) as string
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'What would you like to remember?'
      })
    ],
    content: '',
    editable: true,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[160px]',
        'aria-label': 'Write a note',
        'aria-multiline': 'true',
        role: 'textbox'
      }
    }
  })

  function startEditing() {
    isEditing.value = true
    nextTick(() => {
      if (editor.value) {
        // Convert markdown to HTML for editing
        const htmlContent = props.modelValue ? (marked.parse(props.modelValue) as string) : ''
        editor.value.commands.setContent(htmlContent)
        editor.value.commands.focus()
      }
    })
  }

  function cancelEditing() {
    isEditing.value = false
    if (editor.value) {
      editor.value.commands.setContent('')
    }
  }

  async function saveNotes() {
    if (!editor.value) return

    saving.value = true
    try {
      // Convert HTML to Markdown before saving
      let content: string | null = null
      if (editor.value.getText().trim()) {
        const html = editor.value.getHTML()
        content = turndownService.turndown(html)
      }

      const response = await $fetch<any, string & {}>(props.apiEndpoint, {
        method: 'PATCH',
        body: {
          notes: content
        }
      })

      if (response?.success) {
        emit('update:modelValue', content)

        if (response.workout?.notesUpdatedAt) {
          emit('update:notesUpdatedAt', response.workout.notesUpdatedAt)
        } else if (response.nutrition?.notesUpdatedAt) {
          emit('update:notesUpdatedAt', response.nutrition.notesUpdatedAt)
        }

        isEditing.value = false

        toast.add({
          title: 'Note saved',
          description: 'Your note is saved.',
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
      }
    } catch (e: any) {
      console.error('Error saving notes:', e)
      toast.add({
        title: 'Could not save note',
        description: e.data?.message || e.message || 'Try saving your note again.',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      saving.value = false
    }
  }

  function formatDate(date: string | Date) {
    return formatDateTime(date, 'MMMM d, yyyy h:mm a')
  }

  onBeforeUnmount(() => {
    if (editor.value) {
      editor.value.destroy()
    }
  })
</script>

<style scoped>
  .notes-writing-area:focus-within {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
  summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 2px;
  }
  :deep(.ProseMirror) {
    outline: none;
  }

  :deep(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--ui-text-muted);
    pointer-events: none;
    height: 0;
  }
</style>
