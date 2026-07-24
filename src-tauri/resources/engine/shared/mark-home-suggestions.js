// Shared home-suggestion markers for Codex renderer injectors.
function markHomeSuggestions(home) {
  if (!home) return;
  const suggestionGroup = home.querySelector('.group\\/home-suggestions');
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
    if (!stale.querySelector('.dream-skin-home-suggestions, .group\\/home-suggestions')) {
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
