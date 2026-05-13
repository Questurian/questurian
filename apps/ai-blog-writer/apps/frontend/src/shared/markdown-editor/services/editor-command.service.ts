export function execEditorCommand(command: string, value?: string): void {
  document.execCommand(command, false, value)
}
