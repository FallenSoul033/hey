export function isMissingAuthSession(error) {
  return error?.name === 'AuthSessionMissingError'
}
