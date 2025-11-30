export async function notifyCurrentTopoViewerOfCommandSuccess(
  _commandType: 'deploy' | 'destroy' | 'redeploy'
) {
  if (_commandType) {
    // no-op stub
  }
  // no-op stub
}

export async function notifyCurrentTopoViewerOfCommandFailure(
  _commandType: 'deploy' | 'destroy' | 'redeploy',
  _error?: Error
) {
  // no-op stub - reference params to satisfy linter
  if (_commandType && _error) {
    // no-op
  }
}
