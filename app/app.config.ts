export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      gray: 'neutral',
      neutral: 'zinc',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue'
    },
    // Custom design tokens overrides
    card: {
      slots: {
        // root: 'bg-white dark:bg-gray-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-gray-800',
        body: 'p-4 sm:p-6',
        header: 'p-4 sm:p-6',
        footer: 'p-4 sm:p-6'
      }
    },
    button: {
      slots: {
        base: 'min-h-11 min-w-11'
      },
      defaultVariants: {
        size: 'md'
      }
    },
    modal: {
      slots: {
        overlay: 'backdrop-blur-sm',
        content: 'rounded-lg shadow-md ring-1 ring-gray-200 dark:ring-gray-800'
      }
    },
    dashboardNavbar: {
      slots: {
        title:
          'flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-highlighted sm:text-base',
        icon: 'hidden sm:block shrink-0 size-5 self-center me-1.5'
      }
    },
    dashboardSidebarToggle: {
      base: 'journey-sidebar-toggle size-11 min-h-11 min-w-11'
    },
    dashboardSidebarCollapse: {
      base: 'journey-sidebar-toggle'
    },
    dashboardPanel: {
      slots: {
        root: 'min-h-0'
      }
    }
  },
  // Custom design tokens for consistent usage
  theme: {
    colors: {
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue'
    }
  }
})
