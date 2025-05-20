export const calls: { command: string; terminalName: string }[] = [];
export function execCommandInTerminal(command: string, terminalName: string) {
  calls.push({ command, terminalName });
}
