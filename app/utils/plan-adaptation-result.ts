export function planAdaptationToast(output: unknown) {
  const result = output as { outcome?: string; message?: string; success?: boolean } | null
  if (result?.outcome === 'changed' && result.success === true) {
    return { title: 'Plan Recalculated', description: result.message, color: 'success' as const }
  }
  if (result?.outcome === 'unchanged' && result.success === true) {
    return { title: 'Plan Unchanged', description: result.message, color: 'info' as const }
  }
  return {
    title: 'Recalculation Failed',
    description:
      result?.message ||
      'The recalculation did not return a validated result. Refresh your plan and try again.',
    color: 'error' as const
  }
}
