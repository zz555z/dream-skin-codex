// Shared home-suggestion markers for Codex renderer injectors.
// Prefer classList / attribute matching so Tailwind "group/..." class names
// never depend on multi-layer CSS/JS slash-escape gymnastics.
function queryGroupClass(scope, groupName) {
  if (!scope) return null;
  const needle = `group/${groupName}`;
  if (scope.classList?.contains(needle)) return scope;
  try {
    for (const el of scope.querySelectorAll(`[class*="${needle}"]`)) {
      if (el.classList?.contains(needle)) return el;
    }
  } catch {
    // ignore invalid selectors in older hosts
  }
  return null;
}

function markHomeSuggestions(home) {
  if (!home) return;
  const suggestionGroup = queryGroupClass(home, 'home-suggestions');
  if (suggestionGroup) {
    suggestionGroup.classList.add('dream-skin-home-suggestions');
    const slot = suggestionGroup.parentElement;
    if (slot) slot.classList.add('dream-skin-home-suggestions-slot');
  }
  for (const stale of home.querySelectorAll('.dream-skin-home-suggestions')) {
    if (!suggestionGroup || stale !== suggestionGroup) {
      stale.classList.remove('dream-skin-home-suggestions');
    }
  }
  for (const stale of home.querySelectorAll('.dream-skin-home-suggestions-slot')) {
    if (!stale.querySelector('.dream-skin-home-suggestions') && !queryGroupClass(stale, 'home-suggestions')) {
      stale.classList.remove('dream-skin-home-suggestions-slot');
    }
  }
}

function unmarkHomeSuggestions(root) {
  const scope = root || document;
  scope.querySelectorAll('.dream-skin-home-suggestions').forEach((node) => {
    node.classList.remove('dream-skin-home-suggestions');
  });
  scope.querySelectorAll('.dream-skin-home-suggestions-slot').forEach((node) => {
    node.classList.remove('dream-skin-home-suggestions-slot');
  });
}
