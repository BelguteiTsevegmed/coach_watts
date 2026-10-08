export const prescriptionBoundaryDouble = {
  lockPrescriptionSchedule: async () => {},
  validatePrescriptionWrite: async () => ({
    id: 'test-assessment',
    accepted: true,
    outcome: 'allow',
    violations: []
  }),
  withPrescriptionPublication: async (
    _userId: string,
    expected: any,
    send: (current: any, tx?: any) => Promise<any>
  ) => send(expected, { plannedWorkout: { update: async () => {} } } as any)
}
