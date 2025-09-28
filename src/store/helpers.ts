export function safeCleanup(componentRef: any, cleanupFn: () => void, componentName: string) {
  try {
    if (componentRef) {
      cleanupFn();
    }
  } catch (error) {
    console.debug(`Failed to cleanup ${componentName}:`, error);
    // Continue execution - don't throw
  }
}
