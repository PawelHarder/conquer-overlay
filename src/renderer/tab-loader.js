// HTML partial text is imported at build time by esbuild's htmlTextPlugin.
// This avoids fetch() calls which fail under Electron's file:// protocol.
import searchHtml      from '../../public/partials/search.html';
import historyHtml     from '../../public/partials/history.html';
import watchHtml       from '../../public/partials/watch.html';
import autoclickerHtml from '../../public/partials/autoclicker.html';
import settingsHtml    from '../../public/partials/settings.html';

const PARTIALS = {
  'tab-search':      searchHtml,
  'tab-history':     historyHtml,
  'tab-watch':       watchHtml,
  'tab-autoclicker': autoclickerHtml,
  'tab-settings':    settingsHtml,
};

export function loadTabPartials() {
  for (const [id, html] of Object.entries(PARTIALS)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}
