# Fibery Task #58 — Evidence

**Phase**: Completed

## Resolution
The admin \<main>\, \#sidebar\, and \#mobile-bottom-nav\ elements in \public/app-shell.html\ have been given the \hidden\ attribute by default so they do not participate in layout (preventing the blank 100vh viewport below the public footer). 

In \public/app.js\, the \showOnly(target)\ routing function was updated to dynamically remove the \hidden\ attribute for these elements only when \	arget === 'app'\.

## Verification
- Codebase impact: Minimal layout fix applied directly to shell HTML and client router.
- Production readiness: Passes all standard build and UI tests.
