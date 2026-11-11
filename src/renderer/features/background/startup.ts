export interface StartupTasks<T> {
  openInitialDocument(): void;
  requestOpenRequests(): Promise<T>;
  loadSettings(): Promise<void>;
  showError(error: unknown): void;
}

export function beginStartup<T>(tasks: StartupTasks<T>): Promise<T> {
  tasks.openInitialDocument();
  const openRequests = tasks.requestOpenRequests();
  void Promise.resolve().then(tasks.loadSettings).catch(tasks.showError);
  return openRequests;
}
